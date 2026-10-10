import { test, expect, type Page } from "@playwright/test";
import { TARGET, captureTarget, send } from "./support/app";

// P3.8 (plan D6): the scripts of a collection that came from a file do not
// run until the user has read them and said so. Needs the production build
// (CI=1): the script runs in QuickJS under the production CSP.

// The target is a routed fake host, which the app's service worker would hide in WebKit.
test.use({ serviceWorkers: "block" });

const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 });

/** A collection file as another person would send it: one request, with scripts. */
function collectionFile(post: string) {
  return {
    name: "shared.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        $id: "wayfarer/collection/3",
        meta: meta("file"),
        collection: { id: "col-shared", meta: meta("col-shared"), name: "Shared collection", order: 0, variables: [], auth: { type: "none" }, scripts: { pre: "", post: "" } },
        folders: [],
        requests: [
          {
            id: "req-shared",
            meta: meta("req-shared"),
            collectionId: "col-shared",
            name: "Shared request",
            order: 0,
            method: "GET",
            url: `${TARGET}/trust`,
            params: [],
            headers: [],
            body: { mode: "none" },
            auth: { type: "none" },
            scripts: { pre: 'pm.test("the pre-request script ran", () => {});', post },
            tests: [{ id: "a1", target: "status", operator: "equals", expected: "200" }],
            settings: {},
          },
        ],
      })
    ),
  };
}

async function importFile(page: Page, post: string): Promise<void> {
  await page.locator('app-collections-sidebar input[type="file"]').setInputFiles(collectionFile(post));
  const dialog = page.getByRole("dialog", { name: "Import collection" });
  await dialog.getByRole("button", { name: "Confirm import" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByTitle("Double-click to load into composer").getByText("Shared request", { exact: true }).dblclick();
  await expect(page.locator("input.address-url")).toHaveValue(`${TARGET}/trust`);
}

/** A row of the Tests tab. The Scripts tab holds the same words as script text, so the page is not searched for them. */
const row = (page: Page, label: string) => page.locator(".test-result-pass, .test-result-fail", { hasText: label });
const tests = (page: Page) => page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ });

test("@claim:C-051 an imported collection's scripts do not run until they are reviewed; a re-import with a changed script asks again", async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __violations: string[] }).__violations = seen;
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sample}`));
  });
  const hits = await captureTarget(page);
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  await importFile(page, 'pm.test("the file\'s script ran", () => {});');

  // Sent, and neither script ran.
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  expect(hits).toHaveLength(1);
  await tests(page).click();
  await expect(page.locator(".scripts-skipped")).toBeVisible();
  // The assertion still ran.
  await expect(page.locator(".test-result-pass")).toHaveCount(1);
  await expect(row(page, "the file's script ran")).toHaveCount(0);
  await expect(row(page, "the pre-request script ran")).toHaveCount(0);

  // The Scripts tab says why, and offers the review.
  await page.getByRole("tab", { name: "Scripts", exact: true }).first().click();
  const held = page.locator(".scripts-held");
  await expect(held).toBeVisible();
  await held.getByRole("button", { name: "Review scripts" }).click();
  const review = page.getByRole("dialog", { name: "Review scripts" });
  await expect(review).toContainText("2 scripts in 1 request");
  // Both scripts are there to read, as text.
  await expect(review.locator(".view-lines")).toContainText("the pre-request script ran");
  await expect(review.locator(".view-lines")).toContainText("the file's script ran");
  await review.getByRole("button", { name: "I trust these scripts" }).click();
  await expect(review).toHaveCount(0);
  await expect(held).toHaveCount(0);

  // Trusted: both scripts run.
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await tests(page).click();
  await expect(page.locator(".test-result-pass", { hasText: "the file's script ran" })).toBeVisible();
  await expect(page.locator(".test-result-pass", { hasText: "the pre-request script ran" })).toBeVisible();
  await expect(page.locator(".scripts-skipped")).toHaveCount(0);
  expect(hits).toHaveLength(2);

  // The same collection arrives again with one script changed: nothing of it runs until it is reviewed again.
  await importFile(page, 'pm.test("the changed script ran", () => {});');
  await page.getByRole("tab", { name: "Scripts", exact: true }).first().click();
  await expect(held).toBeVisible();
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await tests(page).click();
  await expect(page.locator(".scripts-skipped")).toBeVisible();
  await expect(row(page, "the changed script ran")).toHaveCount(0);
  // Its other script is the one that was approved, and is held too: the collection is not trusted.
  await expect(row(page, "the pre-request script ran")).toHaveCount(0);

  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
});

test("a script written here runs without a review, also after it is saved into a collection made here", async ({ page }) => {
  await captureTarget(page);
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  // A collection the user makes, and a request saved into it.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("api-sandbox");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const now = Date.now();
    const tx = db.transaction(["collections"], "readwrite");
    tx.objectStore("collections").put({ id: "col-mine", meta: { id: "col-mine", createdAt: now, updatedAt: now, version: 1 }, name: "Mine", order: 0, variables: [], auth: { type: "none" }, scripts: { pre: "", post: "" }, scriptTrust: { trusted: true } });
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  });
  await page.reload();
  await page.locator("input.address-url").fill(`${TARGET}/mine`);
  await page.getByRole("tab", { name: "Scripts", exact: true }).first().click();
  const editor = page.locator("app-script-editor").nth(1).locator(".monaco-editor").first();
  await editor.click();
  await page.keyboard.type("pm.test('typed here', function () {})");
  await expect(page.locator(".scripts-held")).toHaveCount(0);

  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await tests(page).click();
  await expect(page.locator(".test-result-pass", { hasText: "typed here" })).toBeVisible();

  await page.getByRole("button", { name: "Save to Collection" }).first().click();
  const saveAs = page.getByRole("dialog", { name: "Save to Collection" });
  await saveAs.locator("#save-as-name").fill("My request");
  await saveAs.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saveAs).toHaveCount(0);
  await expect(page.locator(".scripts-held")).toHaveCount(0);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await tests(page).click();
  await expect(page.locator(".test-result-pass", { hasText: "typed here" })).toBeVisible();
});
