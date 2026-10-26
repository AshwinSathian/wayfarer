import { test, expect, type Page } from "@playwright/test";
import { seedAndOpen } from "./support/app";
import { ECHO } from "./support/echo";

// D4.11 (U-066, U-068): a save that does not land says so under the address, and Save keeps focus while it saves.

const saveButton = (page: Page) => page.getByRole("button", { name: "Save", exact: true });

async function editAndSave(page: Page): Promise<void> {
  await page.locator("input.address-url").fill(`${ECHO}/echo?edited=1`);
  await saveButton(page).focus();
  await page.keyboard.press("Enter");
}

test("a save IndexedDB refuses says so under the address, and keeps the edit", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });
  await editAndSave(page);
  const said = "The request was not saved: this browser refused the write. Your edits are still here.";
  await expect(page.locator(".save-error")).toHaveText(said);
  await expect(page.getByRole("alert").filter({ hasText: said })).toHaveCount(1);
  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/echo?edited=1`);
  // U-068: the keyboard is still on Save.
  await expect(saveButton(page)).toBeFocused();
});

test("a save of a request deleted in another tab says so under the address", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  // Deleted under the app, as another tab's delete is before the app hears of it.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("wayfarer");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction("requests", "readwrite");
    tx.objectStore("requests").delete("req-tw");
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  });
  await editAndSave(page);
  await expect(page.locator(".save-error")).toHaveText(
    "The request was not saved: it was deleted in another tab. Save it again to put it in a collection.",
  );
  await expect(saveButton(page)).toBeFocused();
});

test("Save keeps the keyboard while it saves, and the save lands", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  await editAndSave(page);
  await expect(saveButton(page)).toBeFocused();
  await expect(page.locator(".save-error")).toHaveCount(0);
  await expect(page.locator(".request-tab-unsaved")).toHaveCount(0);
});
