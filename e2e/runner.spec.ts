import { execFileSync, spawnSync } from "node:child_process";
import { axe } from "./support/axe";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";
import { settled } from "./support/settled";

// P5.2: a collection run in the app. The order of a run is core's and is held to Newman there
// (packages/core/test/run); the first test here runs the same collection and data file in the app.

const FIXTURES = join(__dirname, "../packages/core/test/fixtures/run");
const golden = JSON.parse(readFileSync(join(FIXTURES, "data.golden.json"), "utf8")) as { items: { iteration: number; name: string; tests: { name: string; passed: boolean }[] }[] };

interface PostmanItem {
  name: string;
  request: { method: string; url: string; header: { key: string; value: string }[]; body?: { raw: string } };
  event?: { listen: string; script: { exec: string[] } }[];
}
interface SeededRequest {
  name: string;
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  pre?: string;
  post?: string;
}

/** The requests of the fixture Newman ran, as requests to seed. */
function fixtureRequests(): SeededRequest[] {
  const file = JSON.parse(readFileSync(join(FIXTURES, "data.postman_collection.json"), "utf8")) as { item: PostmanItem[] };
  const script = (item: PostmanItem, listen: string) => item.event?.find((event) => event.listen === listen)?.script.exec.join("\n") ?? "";
  return file.item.map((item) => ({
    name: item.name,
    method: item.request.method,
    url: item.request.url,
    headers: Object.fromEntries(item.request.header.map((header) => [header.key, header.value])),
    body: item.request.body?.raw,
    pre: script(item, "prerequest"),
    post: script(item, "test"),
  }));
}

/** Writes a collection "Shop" of `requests`, their scripts approved as scripts written here are, and an active environment; then reloads. */
async function seedCollection(page: Page, requests: SeededRequest[], vars: Record<string, string> = {}): Promise<void> {
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.waitForFunction(async () => (await indexedDB.databases()).some((db) => db.name === "api-sandbox" && (db.version ?? 0) >= 5));
  await page.evaluate(
    async ({ requests, vars }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("api-sandbox");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const read = db.transaction("meta").objectStore("meta").get("state");
      const state = await new Promise((resolve) => (read.onsuccess = () => resolve(read.result)));
      const now = Date.now();
      const meta = (id: string) => ({ id, createdAt: now, updatedAt: now });
      const rows = (record: Record<string, string>) => Object.entries(record).map(([key, value]) => ({ key, value, enabled: true }));
      const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const approved = await Promise.all(requests.flatMap((request) => [request.pre ?? "", request.post ?? ""]).filter((script) => script.trim()).map(digest));
      const tx = db.transaction(["environments", "collections", "requests", "meta"], "readwrite");
      tx.objectStore("environments").put({ id: "env-run", meta: meta("env-run"), name: "Run env", vars: rows(vars), order: 0 });
      tx.objectStore("meta").put({ schemaVersion: 1, ...(state ?? {}), key: "state", activeEnvironmentId: "env-run" });
      tx.objectStore("collections").put({ id: "col-run", meta: meta("col-run"), name: "Shop", order: 0, variables: [], auth: { type: "none" }, scripts: { pre: "", post: "" }, scriptTrust: { trusted: true, approved } });
      requests.forEach((request, order) =>
        tx.objectStore("requests").put({
          id: `req-${order}`,
          meta: meta(`req-${order}`),
          collectionId: "col-run",
          name: request.name,
          order,
          method: request.method ?? "GET",
          url: request.url,
          params: [],
          headers: rows(request.headers ?? {}),
          body: request.body === undefined ? { mode: "none" } : { mode: "raw", raw: { language: "json", text: request.body } },
          auth: { type: "none" },
          scripts: { pre: request.pre ?? "", post: request.post ?? "" },
          tests: [],
          settings: {},
        })
      );
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { requests, vars }
  );
  await page.reload();
}

/** Opens the run's tab from the collection's menu. */
async function openRun(page: Page, collection = "Shop"): Promise<Locator> {
  await page.getByRole("tree").getByText(collection, { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Run…" }).click();
  const view = page.locator("app-run-view");
  await expect(view.getByRole("heading", { name: `Run ${collection}` })).toBeVisible();
  return view;
}

const resultRows = (view: Locator): Locator => view.getByRole("region", { name: "Run results" }).locator("tbody tr");
const status = (view: Locator): Locator => view.getByRole("status");

/** A download's text. */
async function saved(page: Page, click: () => Promise<void>): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([page.waitForEvent("download"), click()]);
  return { name: download.suggestedFilename(), text: readFileSync(await download.path(), "utf8") };
}

test("three requests and a data file of five rows give the fifteen results Newman gives, and the three reports hold them", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __violations: string[] }).__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => (window as unknown as { __violations: string[] }).__violations.push(event.violatedDirective));
  });
  await seedCollection(page, fixtureRequests(), { base: ECHO, role: "from the environment" });
  const view = await openRun(page);
  await expect(view).toContainText("3 requests");
  await expect(status(view)).toContainText("Nothing is sent until you choose Run");

  await view.getByLabel("Data file for the run").setInputFiles(join(FIXTURES, "data.csv"));
  await expect(view).toContainText("data.csv: 5 rows");
  await view.getByRole("button", { name: "Run", exact: true }).click();

  await expect(status(view)).toContainText("The run is complete.", { timeout: 60_000 });
  await expect(status(view)).toContainText("15 results in 5 iterations; 2 failed; 38 of 40 tests passed.");
  await expect(resultRows(view)).toHaveCount(15);
  // Each row of the table against Newman's: the iteration, the request, how many of its tests passed.
  const cells = await resultRows(view).evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.firstChild?.textContent?.trim() ?? "")));
  expect(cells.map(([, iteration, name, , , tests]) => [Number(iteration) - 1, name, tests])).toEqual(
    golden.items.map((item) => [item.iteration, item.name, `${item.tests.filter((entry) => entry.passed).length} of ${item.tests.length} passed`])
  );
  // A failed test is named in its row, with its message.
  await expect(resultRows(view).nth(11)).toContainText("only an admin is let in: expected false to equal true");

  // The JSON report: every test of every result, as Newman has them.
  const json = await saved(page, () => view.getByRole("button", { name: "JSON", exact: true }).click());
  expect(json.name).toBe("wayfarer-run.json");
  const report = JSON.parse(json.text) as { $id: string; name: string; iterations: number; ended: string; totals: unknown; results: { iteration: number; name: string; status: number; tests: { name: string; passed: boolean }[] }[] };
  expect(report).toMatchObject({ $id: "wayfarer/run", name: "Shop", iterations: 5, ended: "completed", totals: { requests: 15, skipped: 0, tests: 40, failedTests: 2, errors: 0 } });
  expect(report.results.map((result) => ({ iteration: result.iteration, name: result.name, tests: result.tests.map(({ name, passed }) => ({ name, passed })) }))).toEqual(golden.items);

  // The JUnit report: the document core's test validates against the schema, with this run's numbers.
  const junit = await saved(page, () => view.getByRole("button", { name: "JUnit XML" }).click());
  expect(junit.name).toBe("wayfarer-run.junit.xml");
  expect(junit.text).toContain('<testsuites name="Shop" tests="40" failures="2" errors="0"');
  expect(junit.text.match(/<testsuite /g)).toHaveLength(15);

  // The HAR: fifteen exchanges, through the dialog that shows a HAR first.
  await view.getByRole("button", { name: "HAR…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("15");
  const har = await saved(page, () => dialog.getByRole("button", { name: /Save|Download/ }).click());
  const entries = (JSON.parse(har.text) as { log: { version: string; entries: { request: { url: string } }[] } }).log;
  expect(entries.version).toBe("1.2");
  expect(entries.entries).toHaveLength(15);
  expect(entries.entries[1].request.url).toBe(`${ECHO}/echo?user=ann`);

  // A run is not history, and its scripts ran inside the policy.
  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
  await page.keyboard.press("Escape");
});

/** A run's results without what differs from one run to the next: how long each request took, and the ids of the requests. */
const comparable = (report: { iterations: number; ended: string; totals: unknown; results: Record<string, unknown>[] }) => ({
  iterations: report.iterations,
  ended: report.ended,
  totals: report.totals,
  results: report.results.map(({ durationMs: _durationMs, id: _id, ...result }) => result),
});

test("@claim:C-065 the command line runs the P5.2 collection and data file to the results the app's runner gives", async ({ page }) => {
  test.slow();
  await seedCollection(page, fixtureRequests(), { base: ECHO, role: "from the environment" });
  const view = await openRun(page);
  await view.getByLabel("Data file for the run").setInputFiles(join(FIXTURES, "data.csv"));
  await view.getByRole("button", { name: "Run", exact: true }).click();
  await expect(status(view)).toContainText("The run is complete.", { timeout: 60_000 });
  const app = JSON.parse((await saved(page, () => view.getByRole("button", { name: "JSON", exact: true }).click())).text) as Parameters<typeof comparable>[0];

  // The same collection, environment and data file, from the command line (P6.5).
  const cli = join(__dirname, "../packages/cli");
  execFileSync(process.execPath, [join(cli, "build.mjs")]);
  const folder = mkdtempSync(join(tmpdir(), "wayfarer-cli-diff-"));
  try {
    const environment = join(folder, "env.json");
    writeFileSync(environment, JSON.stringify({ name: "Run env", values: [{ key: "base", value: ECHO, enabled: true }, { key: "role", value: "from the environment", enabled: true }] }));
    const run = spawnSync(process.execPath, [join(cli, "dist/wayfarer-cli.mjs"), "run", join(FIXTURES, "data.postman_collection.json"), "-e", environment, "-d", join(FIXTURES, "data.csv"), "--allow-scripts", "--reporter", "json", "--out", folder], { encoding: "utf8" });
    // Two of the fixture's tests fail, in the app as here.
    expect(run.status, run.stderr).toBe(1);
    const fromCli = JSON.parse(readFileSync(join(folder, "wayfarer-run.json"), "utf8")) as Parameters<typeof comparable>[0];
    expect(comparable(fromCli)).toEqual(comparable(app));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("Cancel stops a run within one request", async ({ page }) => {
  await seedCollection(page, [
    { name: "Quick", url: `${ECHO}/echo?n=1` },
    { name: "Slow", url: `${ECHO}/delay/60000` },
    { name: "Never", url: `${ECHO}/echo?n=3` },
  ]);
  const view = await openRun(page);
  await view.getByLabel("Iterations").fill("3");
  await view.getByLabel("Iterations").blur();
  await view.getByRole("button", { name: "Run", exact: true }).click();
  await expect(resultRows(view)).toHaveCount(1);
  await expect(status(view)).toContainText("Running: 1 request done.");

  await view.getByRole("button", { name: "Cancel run" }).click();

  await expect(status(view)).toContainText("The run was cancelled.");
  await expect(resultRows(view)).toHaveCount(2);
  await expect(resultRows(view).nth(1)).toContainText("Slow");
  await expect(resultRows(view).nth(1)).toContainText("The request was cancelled.");
  await expect(resultRows(view).nth(1)).toContainText("No response");
  await expect(view.getByRole("button", { name: "Run again" })).toBeVisible();
});

test("an imported Postman file keeps its order, requests before and between folders: the list shows it, a run follows it as Newman does, and a request moved past a folder is sent after that folder's", async ({ page }) => {
  const NAME = "Run in the file's order";
  const newman = (JSON.parse(readFileSync(join(FIXTURES, "order.golden.json"), "utf8")) as { items: { name: string }[] }).items.map((item) => item.name);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedCollection(page, [], { base: ECHO });
  await page.locator('app-collections-sidebar input[type="file"]').setInputFiles(join(FIXTURES, "order.postman_collection.json"));
  await page.getByRole("dialog").getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The list: one order for a folder's folders and requests, a folder inside its folder.
  const tree = page.getByRole("tree");
  const item = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  const rows = async () => {
    const all = await tree.getByRole("treeitem").evaluateAll((items) => items.map((row) => `${row.getAttribute("aria-level")} ${row.getAttribute("aria-label")}`));
    const rest = all.slice(all.indexOf(`1 ${NAME}`) + 1);
    // Up to the next collection.
    const end = rest.findIndex((row) => row.startsWith("1 "));
    return end < 0 ? rest : rest.slice(0, end);
  };
  await expect.poll(rows).toEqual(["2 Before every folder", "2 Middle", "2 Between two folders", "2 Tail", "2 After every folder"]);
  await item("Middle").focus();
  await page.keyboard.press("ArrowRight");
  await item("Deep").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(rows).toEqual(["2 Before every folder", "2 Middle", "3 First in the folder", "3 Deep", "4 Deepest", "3 After the inner folder", "2 Between two folders", "2 Tail", "2 After every folder"]);

  // The run: the order Newman sent the same file in.
  const names = async (view: Locator) => (await resultRows(view).evaluateAll((list) => list.map((row) => row.querySelectorAll("td")[2]?.firstChild?.textContent?.trim() ?? "")));
  const view = await openRun(page, NAME);
  await expect(view).toContainText("7 requests");
  await view.getByRole("button", { name: "Run", exact: true }).click();
  await expect(status(view)).toContainText("The run is complete.", { timeout: 60_000 });
  expect(await names(view)).toEqual(newman);

  // Alt+ArrowDown takes the first request past the folder after it; the place is stored.
  await item("Before every folder").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(async () => (await rows()).filter((row) => row.startsWith("2 "))).toEqual(["2 Middle", "2 Before every folder", "2 Between two folders", "2 Tail", "2 After every folder"]);
  await expect(item("Before every folder")).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const open = indexedDB.open("api-sandbox");
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
        });
        const all = (store: string) => new Promise<{ name: string; order: number; folderId?: string; parentFolderId?: string }[]>((resolve) => (db.transaction(store).objectStore(store).getAll().onsuccess = (event) => resolve((event.target as IDBRequest).result)));
        const top = [...(await all("folders")).filter((folder) => !folder.parentFolderId), ...(await all("requests")).filter((request) => !request.folderId)];
        db.close();
        return top.sort((a, b) => a.order - b.order).map((entry) => entry.name);
      })
    )
    .toEqual(["Middle", "Before every folder", "Between two folders", "Tail", "After every folder"]);
  await page.reload();
  await expect.poll(rows).toEqual(["2 Middle", "2 Before every folder", "2 Between two folders", "2 Tail", "2 After every folder"]);

  const again = await openRun(page, NAME);
  await again.getByRole("button", { name: "Run", exact: true }).click();
  await expect(status(again)).toContainText("The run is complete.", { timeout: 60_000 });
  expect(await names(again)).toEqual(["First in the folder", "Deepest", "After the inner folder", "Before every folder", "Between two folders", "In the last folder", "After every folder"]);
});

test("a folder is copied and deleted with the folders inside it: the copy holds them, and the question says what goes", async ({ page }) => {
  const NAME = "Run in the file's order";
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedCollection(page, [], { base: ECHO });
  await page.locator('app-collections-sidebar input[type="file"]').setInputFiles(join(FIXTURES, "order.postman_collection.json"));
  await page.getByRole("dialog").getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const tree = page.getByRole("tree");
  const item = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  const rows = async () => {
    const all = await tree.getByRole("treeitem").evaluateAll((items) => items.map((row) => `${row.getAttribute("aria-level")} ${row.getAttribute("aria-label")}`));
    const rest = all.slice(all.indexOf(`1 ${NAME}`) + 1);
    const end = rest.findIndex((row) => row.startsWith("1 "));
    return end < 0 ? rest : rest.slice(0, end);
  };
  const menu = async (name: string, entry: string) => {
    await item(name).focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menuitem").first()).toBeFocused();
    await page.getByRole("menuitem", { name: entry, exact: true }).click();
  };

  await menu("Middle", "Duplicate");
  await expect(item("Middle copy")).toBeVisible();
  await item("Middle copy").focus();
  await page.keyboard.press("ArrowRight");
  await item("Deep").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(rows).toEqual(["2 Before every folder", "2 Middle", "2 Between two folders", "2 Tail", "2 After every folder", "2 Middle copy", "3 First in the folder", "3 Deep", "4 Deepest", "3 After the inner folder"]);

  // The original goes with what is in it; the copy stays whole.
  await menu("Middle", "Delete");
  const question = page.getByRole("alertdialog", { name: "Delete item?" });
  await expect(question).toContainText('Folder "Middle" is deleted with the 1 folder and 3 requests in it.');
  await question.getByRole("button", { name: "Proceed", exact: true }).click();
  await expect.poll(rows).toEqual(["2 Before every folder", "2 Between two folders", "2 Tail", "2 After every folder", "2 Middle copy", "3 First in the folder", "3 Deep", "4 Deepest", "3 After the inner folder"]);
  await page.reload();
  await expect(item("Middle copy")).toBeVisible();
  await expect(item("Middle")).toHaveCount(0);
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("api-sandbox");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const names = (store: string) => new Promise<string[]>((resolve) => (db.transaction(store).objectStore(store).getAll().onsuccess = (event) => resolve(((event.target as IDBRequest).result as { name: string }[]).map((doc) => doc.name).sort())));
    const found = { folders: await names("folders"), requests: await names("requests") };
    db.close();
    return found;
  });
  expect(stored.folders).toEqual(["Deep", "Middle copy", "Tail"]);
  expect(stored.requests).toEqual(["After every folder", "After the inner folder", "Before every folder", "Between two folders", "Deepest", "First in the folder", "In the last folder"]);
});

test("a run goes on while another tab is open, stops at the first failure when asked to, and its tab is not stored", async ({ page }) => {
  await seedCollection(page, [
    { name: "One", url: `${ECHO}/delay/1500`, post: `pm.test("one is fine", () => pm.response.to.have.status(200));` },
    { name: "Two", url: `${ECHO}/status/500`, post: `pm.test("two is fine", () => pm.response.to.have.status(200));` },
    { name: "Three", url: `${ECHO}/echo` },
  ]);
  const view = await openRun(page);
  const strip = page.getByRole("tablist", { name: "Open requests" });
  await expect(strip.getByRole("tab")).toHaveCount(2);
  await expect(strip.getByRole("tab").nth(1)).toContainText("RUN");
  await view.getByRole("checkbox", { name: "Stop on the first failure" }).check();
  await view.getByRole("button", { name: "Run", exact: true }).click();
  await expect(status(view)).toContainText("Running");

  // Another tab, and a request of its own, while the run is going.
  await strip.getByRole("tab").nth(0).click();
  await page.locator("input.address-url").fill(`${ECHO}/status/204`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("204", { timeout: 15_000 });

  await strip.getByRole("tab").nth(1).click();
  await expect(status(view)).toContainText("The run stopped at the first failure.", { timeout: 15_000 });
  await expect(resultRows(view)).toHaveCount(2);
  await expect(resultRows(view).nth(1)).toContainText("two is fine");
  await expect(resultRows(view).nth(1)).toContainText("500");

  // The send is in history; the run's two requests are not.
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("api-sandbox");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const all = (store: string) => new Promise<unknown[]>((resolve) => (db.transaction(store).objectStore(store).getAll().onsuccess = (event) => resolve((event.target as IDBRequest<unknown[]>).result)));
    const result = { history: await all("history"), tabs: await all("tabs") };
    db.close();
    return result;
  });
  expect((stored.history as { sent: { url: string } }[]).map((entry) => entry.sent.url)).toEqual([`${ECHO}/status/204`]);

  // A reload brings back the request's tab and not the run's.
  await expect.poll(async () => (await page.evaluate(async () => (await indexedDB.databases()).length)) > 0).toBe(true);
  await page.reload();
  await expect(strip.getByRole("tab")).toHaveCount(1);
  await expect(page.locator("app-run-view")).toHaveCount(0);
});

for (const theme of ["dark", "light"] as const) {
  test(`a run's view has no critical or serious violation in the ${theme} theme, and is not wider than the window at four widths`, async ({ page }) => {
    test.slow();
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedCollection(page, [
      { name: "A request with a long name that has to wrap somewhere in a narrow window", url: `${ECHO}/status/500`, post: `pm.test("a test with a long name, which fails with a long message too", () => pm.response.to.have.status(200));` },
      { name: "Unsendable", url: "{{nowhere}}/x" },
      { name: "Fine", url: `${ECHO}/echo`, post: `pm.test("fine", () => pm.response.to.have.status(200));` },
    ]);
    const view = await openRun(page);
    const scan = async (state: string) => {
      await page.mouse.move(640, 880);
      // Once the page has stopped animating: a colour half way through a fade is not the colour.
      await settled(page);
      const results = await axe(page).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((node) => `${state}: ${v.id}: ${node.target.join(" ")}`))).toEqual([]);
    };
    await scan("before the run");
    await view.getByLabel("Data file for the run").setInputFiles({ name: "not-data.json", mimeType: "application/json", buffer: Buffer.from("{}") });
    await expect(view).toContainText("A JSON data file is a list of objects");
    await view.getByRole("button", { name: "Run", exact: true }).click();
    await expect(status(view)).toContainText("The run is complete.", { timeout: 30_000 });
    await expect(resultRows(view)).toHaveCount(3);
    await scan("after the run");

    for (const width of [360, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(view.getByRole("button", { name: "Run again" })).toBeVisible();
      // Polled: below 1200 px the sidebar becomes a drawer, which takes the page a moment after the window changed.
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `at ${width} px` }).toBeLessThanOrEqual(0);
      // The table scrolls inside its own region when it must; the buttons stay in the window.
      for (const name of ["Run again", "JSON", "JUnit XML", "HAR…", "Data file…"]) {
        // Polled, like the width: the drawer's change of layout takes a moment.
        await expect.poll(async () => { const box = await view.getByRole("button", { name, exact: true }).boundingBox(); return !!box && box.x >= 0 && box.x + box.width <= width; }, { message: `${name} at ${width} px` }).toBe(true);
      }
    }
  });
}
