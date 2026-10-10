import { readFile, readdir } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { dumpIdb } from "./support/app";

// P4.1: the one road by which a file reaches the stores. Read, map and
// check (in a worker), report, confirm, write. Run with CI=1 (the built app).

const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 });
const none = { pre: "", post: "" };
const request = (id: string, name: string, fields: Record<string, unknown> = {}) => ({
  id,
  meta: meta(id),
  collectionId: "col-import",
  name,
  order: 0,
  method: "GET",
  url: `https://api.example.test/${id}`,
  params: [],
  headers: [],
  body: { mode: "none" },
  auth: { type: "inherit" },
  scripts: none,
  tests: [],
  settings: {},
  ...fields,
});
const collection = (requests: unknown[], folders: unknown[] = []) => ({
  $id: "wayfarer/collection/3",
  meta: meta("file"),
  collection: { id: "col-import", meta: meta("col-import"), name: "Imported collection", order: 0, variables: [], auth: { type: "none" }, scripts: none },
  folders,
  requests,
});
const file = (name: string, content: unknown) => ({ name, mimeType: "application/json", buffer: Buffer.from(typeof content === "string" ? content : JSON.stringify(content)) });

const pick = (page: Page, picked: ReturnType<typeof file>) => page.locator('app-collections-sidebar input[type="file"]').setInputFiles(picked);
const dialog = (page: Page, name = "Import collection") => page.getByRole("dialog", { name, exact: true });
/** Every store, as text: what "nothing was stored" is compared on. */
const stored = async (page: Page) => JSON.stringify(await dumpIdb(page));

test("@claim:C-054 an import shows what it will add and what it could not keep before anything is stored; cancelled, it stores nothing", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const before = await stored(page);

  await pick(
    page,
    file("shared.json", collection([request("r-1", "Plain"), request("r-2", "With a cookie jar", { scripts: { pre: "const jar = pm.cookies.jar();", post: "" } })], [{ id: "f-1", meta: meta("f-1"), collectionId: "col-import", name: "A folder", order: 0, variables: [], auth: { type: "inherit" }, scripts: none }]))
  );
  const report = dialog(page);
  // What it is and what it will add.
  await expect(report.locator(".import-report")).toContainText("Wayfarer collection");
  await expect(report.locator(".import-report")).toContainText('"shared.json" will add 1 collection, 1 folder and 2 requests.');
  // What it could not keep: a script that uses what the app does not have, named by where it is.
  await expect(report.locator(".import-warnings")).toContainText('request "With a cookie jar". Its pre-request script uses pm.cookies.jar, which Wayfarer does not have.');
  // The report is on screen and nothing is stored yet.
  expect(await stored(page)).toBe(before);

  await report.getByRole("button", { name: "Cancel import" }).click();
  await expect(report).toHaveCount(0);
  expect(await stored(page)).toBe(before);
  await expect(page.getByText("Imported collection", { exact: true })).toHaveCount(0);

  // Chosen again and confirmed: it is stored, untrusted, with its scripts not approved.
  await pick(page, file("shared.json", collection([request("r-1", "Plain")])));
  await report.getByRole("button", { name: "Confirm import" }).click();
  await expect(report).toHaveCount(0);
  await expect(page.getByText("Imported collection", { exact: true })).toBeVisible();
  const after = await dumpIdb(page);
  expect(after["collections"]).toMatchObject([{ name: "Imported collection", scriptTrust: { trusted: false } }]);
  expect(after["requests"]).toHaveLength(1);
});

test("a file of no known format is refused with a message that names the formats, and nothing is stored", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const before = await stored(page);

  await pick(page, file("postman.json", { info: { name: "Not yet", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" }, item: [] }));
  const refused = dialog(page, "Import");
  await expect(refused.getByRole("alert")).toContainText('Unable to import "postman.json"');
  await expect(refused.getByRole("alert")).toContainText('It reads a Wayfarer collection ("$id": "wayfarer/collection/3") and a Wayfarer environments file ("$id": "wayfarer/environments/2").');
  await expect(refused.getByRole("button", { name: "Confirm import" })).toBeDisabled();
  await refused.getByRole("button", { name: "Cancel import" }).click();

  // A file of a known format with a wrong field: each problem by its path.
  await pick(page, file("broken.json", collection([request("r-1", "Broken", { method: "get it" })])));
  await expect(refused.getByRole("alert")).toContainText("requests[0].method — Value must be an HTTP method");
  await refused.getByRole("button", { name: "Cancel import" }).click();
  expect(await stored(page)).toBe(before);
});

test("one road: a collection file picked with the Environments panel's Import is imported as the collection it is", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator('app-environments-manager input[type="file"]').setInputFiles(file("shared.json", collection([request("r-1", "Plain")])));
  await dialog(page).getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByText("Imported collection", { exact: true })).toBeVisible();
});

test("the worker and the importers are not in the page the server sends, and are fetched when a file is picked", async ({ page }) => {
  const dist = "dist/wayfarer/browser";
  const index = await readFile(`${dist}/index.html`, "utf8");
  const initial = [...index.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((match) => match[1]);
  expect(initial.length).toBeGreaterThan(0);
  // The importers say this sentence, and nothing the page loads at the start holds it.
  const marker = "This is not a file Wayfarer can import";
  for (const name of initial) {
    expect(await readFile(`${dist}/${name}`, "utf8"), name).not.toContain(marker);
  }
  const holders = [];
  for (const name of (await readdir(dist)).filter((entry) => entry.endsWith(".js"))) {
    if ((await readFile(`${dist}/${name}`, "utf8")).includes(marker)) holders.push(name);
  }
  expect(holders).toHaveLength(1);
  expect(holders[0]).toMatch(/^worker-[A-Z0-9]{8}\.js$/);

  const scripts: string[] = [];
  page.on("request", (sent) => scripts.push(new URL(sent.url()).pathname.slice(1)));
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  expect(scripts).not.toContain(holders[0]);
  await pick(page, file("shared.json", collection([request("r-1", "Plain")])));
  await expect(dialog(page)).toBeVisible();
  expect(scripts).toContain(holders[0]);
});

test("5,000 requests in one file import, and the page says how long it took", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "The plan's AC is Chromium; the time is recorded there.");
  test.slow();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Shaped like a Postman export of a large API: 100 folders of 50 requests, each with headers, a JSON body and a test script.
  const folders = Array.from({ length: 100 }, (_, f) => ({ id: `f-${f}`, meta: meta(`f-${f}`), collectionId: "col-import", name: `Folder ${f}`, order: f, variables: [], auth: { type: "inherit" }, scripts: none }));
  const requests = Array.from({ length: 5000 }, (_, r) =>
    request(`r-${r}`, `Request ${r}`, {
      folderId: `f-${r % 100}`,
      order: r,
      method: "POST",
      url: `{{baseUrl}}/v1/resources/${r}?expand=owner&page={{page}}`,
      headers: [
        { key: "Content-Type", value: "application/json", enabled: true },
        { key: "X-Request-Id", value: "{{$guid}}", enabled: true },
      ],
      body: { mode: "raw", raw: { language: "json", text: JSON.stringify({ id: r, name: `resource ${r}`, tags: ["a", "b", "c"], nested: { enabled: true, note: "x".repeat(200) } }, null, 2) } },
      scripts: { pre: "", post: `pm.test("status is 200", () => pm.response.to.have.status(200));\npm.environment.set("last", String(${r}));` },
    })
  );
  const big = file("large.json", collection(requests, folders));
  expect(big.buffer.byteLength).toBeLessThan(10 * 1024 * 1024);
  expect(big.buffer.byteLength).toBeGreaterThan(3 * 1024 * 1024);

  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const started = Date.now();
  await pick(page, big);
  const report = dialog(page);
  await expect(report.locator(".import-report")).toContainText("will add 1 collection, 100 folders and 5000 requests.", { timeout: 60_000 });
  const reported = Date.now();
  await report.getByRole("button", { name: "Confirm import" }).click();
  await expect(report).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText("Imported collection", { exact: true })).toBeVisible({ timeout: 60_000 });
  const done = Date.now();

  const counts = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("api-sandbox");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const count = (name: string) => new Promise<number>((resolve) => (db.transaction(name).objectStore(name).count().onsuccess = (event) => resolve((event.target as IDBRequest<number>).result)));
    const result = [await count("collections"), await count("folders"), await count("requests")];
    db.close();
    return result;
  });
  expect(counts).toEqual([1, 100, 5000]);
  expect(errors).toEqual([]);
  // Recorded, not asserted (plan R6): Appendix A has the readings; the plan's number to compare with is 10 s.
  const timing = `import of 5,000 requests (${big.buffer.byteLength} B): report after ${reported - started} ms, stored after ${done - started} ms`;
  testInfo.annotations.push({ type: "timing", description: timing });
  console.log(timing);
});
