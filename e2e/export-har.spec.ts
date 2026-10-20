import { expect, test, type Download, type Page } from "@playwright/test";
import { dumpIdb, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// P4.6 (c): exchanges as a HAR 1.2 file, shown before it is written: one
// response from its Export menu, or the entries ticked in history. Run with CI=1.

interface Har {
  log: {
    version: string;
    creator: { name: string; version: string };
    entries: { startedDateTime: string; request: { method: string; url: string; headers: { name: string; value: string }[]; postData?: { mimeType: string; text: string } }; response: { status: number; content: { mimeType: string; text?: string } } }[];
  };
}

async function textOf(download: Download): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function sendTo(page: Page, url: string): Promise<void> {
  await page.locator("input.address-url").fill(url);
  const answered = page.waitForResponse((response) => response.url() === url && response.request().method() !== "OPTIONS");
  await send(page);
  await answered;
  await expect(page.locator(".status-badge")).toHaveText("200");
}

test("@claim:C-035 history entries ticked in the list export as one HAR, shown first, and the file imports again as the same requests", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpen(page, {}, { method: "POST", url: `${ECHO}/echo?n=1`, headers: { "X-Api-Key": "typed-key-c035", "X-Trace": "t-1" }, body: { name: "Rex" } });
  await sendTo(page, `${ECHO}/echo?n=1`);
  await sendTo(page, `${ECHO}/content/xml?n=2`);
  await sendTo(page, `${ECHO}/echo?n=3`);
  await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(3);

  await page.getByRole("button", { name: "Request history", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Request history" });
  const exportButton = drawer.getByRole("button", { name: /Export .*as HAR…/ });
  await expect(exportButton).toBeDisabled();
  // Two by their own boxes, then all that are shown.
  await drawer.getByRole("checkbox", { name: `Select POST ${ECHO}/echo?n=3 for export` }).check();
  await drawer.getByRole("checkbox", { name: `Select POST ${ECHO}/echo?n=1 for export` }).check();
  await expect(exportButton).toHaveText(/Export 2 as HAR…/);
  await drawer.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(exportButton).toHaveText(/Export 3 as HAR…/);
  await exportButton.click();

  const dialog = page.getByRole("dialog", { name: "Export as HAR" });
  await expect(dialog.locator(".har-export-summary")).toContainText("A HAR 1.2 file of 3 exchanges");
  await expect(dialog.getByText("History is stored with credentials and vault secrets already masked")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Include credentials" })).toHaveCount(0);
  const preview = dialog.locator(".har-export-preview");
  await expect(preview).toContainText('"version": "1.2"');
  const shown = (await preview.textContent()) ?? "";
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Save file" }).click()]);
  expect(download.suggestedFilename()).toBe("wayfarer-history.har");
  const text = await textOf(download);
  // What was shown is what was written.
  expect(text).toBe(shown);
  await expect(dialog).toHaveCount(0);

  const har = JSON.parse(text) as Har;
  expect(har.log.version).toBe("1.2");
  expect(har.log.creator.name).toBe("Wayfarer");
  // Oldest first, each as it was sent, with a body of text whatever its type.
  expect(har.log.entries.map((entry) => [entry.request.method, entry.request.url, entry.response.status])).toEqual([
    ["POST", `${ECHO}/echo?n=1`, 200],
    ["POST", `${ECHO}/content/xml?n=2`, 200],
    ["POST", `${ECHO}/echo?n=3`, 200],
  ]);
  expect(JSON.parse(har.log.entries[0].request.postData?.text ?? "")).toEqual({ name: "Rex" });
  expect(har.log.entries[1].response.content.mimeType).toContain("xml");
  expect(har.log.entries[1].response.content.text).toContain("<");
  expect(JSON.parse(har.log.entries[0].response.content.text ?? "")).toMatchObject({ method: "POST", url: "/echo?n=1" });
  // A credential is masked, as history holds it: also where the server sent it back.
  expect(text).not.toContain("typed-key-c035");
  expect(har.log.entries[0].request.headers).toContainEqual({ name: "X-Api-Key", value: "***" });
  expect(har.log.entries[0].request.headers).toContainEqual({ name: "X-Trace", value: "t-1" });

  // The file comes back through the import (P4.5) as the same three requests.
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await page.locator('app-collections-sidebar input[type="file"]').setInputFiles({ name: "wayfarer-history.har", mimeType: "application/json", buffer: Buffer.from(text) });
  const report = page.getByRole("dialog", { name: "Import collection" });
  await expect(report.locator(".import-report")).toContainText('"wayfarer-history.har" will add 1 collection and 3 requests.');
  await report.getByRole("button", { name: "Confirm import" }).click();
  await expect(report).toHaveCount(0);
  const requests = ((await dumpIdb(page))["requests"] as { collectionId: string; order: number; method: string; url: string; headers: { key: string; value: string }[]; body: { mode: string; raw?: { text: string; language: string } } }[])
    .filter((request) => request.collectionId !== "col-tw")
    .sort((a, b) => a.order - b.order);
  expect(requests.map((request) => [request.method, request.url, request.body.mode])).toEqual([
    ["POST", `${ECHO}/echo?n=1`, "raw"],
    ["POST", `${ECHO}/content/xml?n=2`, "raw"],
    ["POST", `${ECHO}/echo?n=3`, "raw"],
  ]);
  expect(JSON.parse(requests[0].body.raw?.text ?? "")).toEqual({ name: "Rex" });
  // The headers as sent. The body's type is not a row: it is what the body says it is, and is sent again from there.
  expect(requests[0].body.raw?.language).toBe("json");
  expect(requests[0].headers.map((row) => [row.key, row.value])).toEqual(har.log.entries[0].request.headers.filter((header) => header.name !== "Content-Type").map((header) => [header.name, header.value]));
});

test("@claim:C-035 a response's Export as HAR… shows the file first: masked, or with credentials when asked, and what is copied is what is shown", async ({ page }) => {
  await page.addInitScript(() => {
    const written: string[] = [];
    (window as unknown as { __clipboard: string[] }).__clipboard = written;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void written.push(text) } });
  });
  await seedAndOpen(page, {}, { method: "POST", url: `${ECHO}/echo`, auth: { type: "bearer", token: "typed-bearer-c035" }, storedBody: { mode: "urlencoded", urlencoded: [{ key: "q", value: "a b", enabled: true }] } });
  await sendTo(page, `${ECHO}/echo`);

  await page.getByRole("button", { name: "Export response" }).click();
  await page.getByRole("menuitem", { name: "Export as HAR…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export as HAR" });
  const preview = dialog.locator(".har-export-preview");
  await expect(dialog.locator(".har-export-summary")).toContainText("A HAR 1.2 file of 1 exchange:");
  await expect(preview).toContainText('"value": "***"');
  await expect(preview).not.toContainText("typed-bearer-c035");
  // A form is written as its fields.
  await expect(preview).toContainText('"mimeType": "application/x-www-form-urlencoded"');

  await dialog.getByRole("checkbox", { name: "Include credentials" }).check();
  await expect(preview).toContainText("Bearer typed-bearer-c035");
  const shown = (await preview.textContent()) ?? "";
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const copied = await page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard);
  expect(copied).toEqual([shown]);
  const har = JSON.parse(copied[0]) as Har & { log: { entries: { request: { postData?: { params?: unknown } } }[] } };
  expect(har.log.entries[0].request.postData?.params).toEqual([{ name: "q", value: "a b" }]);

  // Opened again, it starts masked.
  await page.getByRole("button", { name: "Export response" }).click();
  await page.getByRole("menuitem", { name: "Export as HAR…", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "Include credentials" })).not.toBeChecked();
  await expect(preview).not.toContainText("typed-bearer-c035");
});

// Material's menu took `pointer-events: none` while it animated. On CI's
// slow runner its entrance began between a click's press and its release
// (e2e/FLAKES.md, C-007 at Export as HAR…): the press was on the item, the
// release on the backdrop, and the click went to neither. The entrance is
// made 60 s long here, so that the whole click falls inside it.
test("an item clicked while its menu is still opening is chosen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  await sendTo(page, `${ECHO}/echo`);
  await page.addStyleTag({ content: ".ui-menu { animation-duration: 60s !important; }" });

  await page.getByRole("button", { name: "Export response" }).click();
  const item = page.getByRole("menuitem", { name: "Export as HAR…", exact: true });
  await expect.poll(() => page.getByRole("menu").evaluate((el) => el.getAnimations().some((a) => a.playState === "running"))).toBe(true);
  const box = await item.boundingBox();
  if (!box) throw new Error("The menu item has no box.");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("dialog", { name: "Export as HAR" })).toBeVisible();
});
