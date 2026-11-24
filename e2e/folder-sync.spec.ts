import { expect, test, type Page } from "@playwright/test";
import { seedAndOpen } from "./support/app";
import { ECHO } from "./support/echo";

// T2.2 and T2.4 (docs/folders.md): a collection kept as files in a folder, and a change made in the folder from
// outside shown with its diff and taken only on a yes. Chromium has the folder picker; the test gives the page the
// browser's own origin-private folder in its place (the same handle API, without the prompt), and edits that folder
// from the page as `git pull` would from outside.

test.skip(({ browserName }) => browserName !== "chromium", "Only Chromium has the folder picker");

async function withFolder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle("repo", { create: true });
    };
  });
}

/** The folder's files by path, read from outside the app. */
async function files(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const out: Record<string, string> = {};
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === "directory") await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
        else out[`${prefix}${name}`] = await (await (handle as FileSystemFileHandle).getFile()).text();
      }
    };
    await walk(await (await navigator.storage.getDirectory()).getDirectoryHandle("repo", { create: true }), "");
    return out;
  });
}

/** What a `git pull` does to a file: writes its new text. */
async function writeFromOutside(page: Page, path: string, text: string): Promise<void> {
  await page.evaluate(
    async ({ path, text }) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("repo", { create: true });
      const writable = await (await dir.getFileHandle(path, { create: true })).createWritable();
      await writable.write(text);
      await writable.close();
    },
    { path, text },
  );
}

/** The addresses of the saved requests, as stored. */
async function storedUrls(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("wayfarer");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction("requests").objectStore("requests").getAll();
          all.onsuccess = () => resolve((all.result as { url: string }[]).map((request) => request.url));
        };
      }),
  );
}

async function makeCollection(page: Page): Promise<void> {
  await page.goto("/app/");
  await page.getByRole("button", { name: "New collection" }).first().click();
  await page.locator("#creation-name-input").fill("Billing");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("#creation-name-input")).toHaveCount(0);
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await page.getByRole("button", { name: "Save to collection" }).click();
  const dialog = page.getByRole("dialog", { name: "Save to collection" });
  await dialog.locator("#save-as-name").fill("Ping");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function keepInFolder(page: Page, collection = "Billing"): Promise<void> {
  await page.getByRole("tree").getByText(collection, { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Save to a folder on disk…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Save ${collection} to a folder on disk` });
  const kept = page.getByRole("dialog", { name: new RegExp(`^${collection} is kept in `) });
  await dialog.getByRole("button", { name: "Choose a folder" }).click();
  await expect(kept).toBeVisible();
  await kept.getByRole("button", { name: "Done", exact: true }).click();
  await expect(kept).toHaveCount(0);
}

const requestPath = (all: Record<string, string>) =>
  Object.keys(all).find((p) => p.endsWith(".request.json")) as string;

test("@claim:C-095 a collection kept in a folder is written as plain files, and a credential typed into it is written as ***", async ({
  page,
}) => {
  await withFolder(page);
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth: { type: "bearer", token: "hunter2-typed" } });
  await keepInFolder(page, "Tripwire collection");

  await expect
    .poll(async () => Object.keys(await files(page)).sort())
    .toEqual(["collection.json", "tripwire-request.req-tw.request.json"]);
  const all = await files(page);
  const text = Object.values(all).join("\n");
  expect(text).not.toContain("hunter2-typed");
  expect(text).not.toMatch(/createdAt|updatedAt/);
  expect(text).toContain('"token": "***"');
});

test("@claim:C-096 a change made in the folder from outside is shown with its diff and reaches the collection only when taken", async ({
  page,
}) => {
  await withFolder(page);
  await makeCollection(page);
  await keepInFolder(page);
  await expect.poll(async () => requestPath(await files(page))).toBeTruthy();

  const path = requestPath(await files(page));
  const pulled = (await files(page))[path].replace(`${ECHO}/echo`, `${ECHO}/pulled`);
  await writeFromOutside(page, path, pulled);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  const waiting = page.getByRole("button", { name: "Changes in the folder of Billing" });
  await expect(waiting).toBeVisible();
  await waiting.click();
  const dialog = page.getByRole("dialog", { name: /^Billing is kept in / });
  await expect(dialog.getByRole("status")).toHaveText(/the folder changed outside Wayfarer/);
  // A person reads what changed by name, with the file's path beside it.
  await expect(dialog.getByText("Request · Ping")).toBeVisible();
  await dialog.getByText(path, { exact: false }).click();
  await expect(dialog.getByRole("group").locator("pre")).toContainText(`+ ${"  "}"url": "${ECHO}/pulled"`);

  // Nothing is taken yet: the request here still sends to /echo.
  expect(await storedUrls(page)).toEqual([`${ECHO}/echo`]);

  await dialog.getByRole("button", { name: "Review and take" }).click();
  const report = page.getByRole("dialog").filter({ hasText: "Billing" });
  await report.getByRole("button", { name: "Import", exact: true }).click();
  await expect(report).toHaveCount(0);

  await expect.poll(() => storedUrls(page)).toEqual([`${ECHO}/pulled`]);
  // The open tab was not unsaved, so it shows the request as taken, not the old one (loupe, 3.5.0).
  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/pulled`);
  await expect(waiting).toHaveCount(0);
});

test("a change made here is written to the folder, and a file the format does not read is left alone", async ({
  page,
}) => {
  await withFolder(page);
  await makeCollection(page);
  await keepInFolder(page);
  await expect.poll(async () => requestPath(await files(page))).toBeTruthy();
  await writeFromOutside(page, "README.md", "notes\n");

  await page.getByRole("tree").getByText("Ping").click();
  await page.keyboard.press("F2");
  await page.getByRole("textbox", { name: "Rename Ping" }).fill("Renamed");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => Object.keys(await files(page)).some((p) => p.startsWith("renamed.")), { timeout: 15_000 })
    .toBe(true);
  const after = await files(page);
  expect(Object.keys(after).some((p) => p.startsWith("ping."))).toBe(false);
  expect(after["README.md"]).toBe("notes\n");
});

test("a folder whose collection file names another collection is not taken as this one", async ({ page }) => {
  await withFolder(page);
  await makeCollection(page);
  await keepInFolder(page);
  await expect.poll(async () => Object.keys(await files(page)).includes("collection.json")).toBe(true);
  const other = (await files(page))["collection.json"].replace(/"id": "[^"]+"/, '"id": "another-collection"');
  await writeFromOutside(page, "collection.json", other);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await page.getByRole("button", { name: "Changes in the folder of Billing" }).click();
  const dialog = page.getByRole("dialog", { name: /^Billing is kept in / });
  await dialog.getByRole("button", { name: "Review and take" }).click();
  await expect(dialog.getByRole("alert")).toContainText("holds a different collection");
  expect(await storedUrls(page)).toEqual([`${ECHO}/echo`]);
});
