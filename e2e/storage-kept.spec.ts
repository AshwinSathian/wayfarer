import { expect, type Page, test } from "@playwright/test";
import { ECHO } from "./support/echo";

// U-137: Safari deletes a site's data after seven days without a visit unless the browser has promised to keep it,
// and the reminder to back up waited 14 days. The status bar says what the browser promised, and while it has
// promised nothing the reminder comes at the first save and then every 5 days. What the browser answers is set here:
// each engine decides by itself, and Chromium's answer changes with how much the site was used.

const DAY = 24 * 60 * 60 * 1000;

function browserKeeps(page: Page, kept: boolean): Promise<void> {
  return page.addInitScript((kept) => {
    Object.defineProperty(StorageManager.prototype, "persisted", { value: () => Promise.resolve(kept) });
    Object.defineProperty(StorageManager.prototype, "persist", { value: () => Promise.resolve(kept) });
  }, kept);
}

async function saveARequest(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New collection" }).first().click();
  await page.locator("#creation-name-input").fill("Kept");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  // The page is inert until the dialog has closed.
  await expect(page.locator("#creation-name-input")).toHaveCount(0);
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await page.getByRole("button", { name: "Save to collection" }).click();
  const dialog = page.getByRole("dialog", { name: "Save to collection" });
  await dialog.locator("#save-as-name").fill("First");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test("while the browser has not promised to keep the data, the status bar says so and the first save brings the reminder", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === "webkit", "Safari's seven days come first there: the test below");
  await page.setViewportSize({ width: 1440, height: 900 });
  await browserKeeps(page, false);
  await page.clock.install();
  await page.goto("/app/");
  const status = page.getByRole("contentinfo", { name: "Status" });
  await expect(status).toContainText("Saved in this browser, which may delete it");
  // It leads to Data and storage, which says what that means and has the backup.
  await status.getByRole("button", { name: "Saved in this browser, which may delete it", exact: true }).click();
  await expect(page.getByTestId("storage-status")).toContainText("has not promised to keep this data");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("storage-status")).toHaveCount(0);
  const reminder = page
    .getByRole("status")
    .filter({ hasText: /which has not promised to keep it\. Back up to keep a copy\./ });
  await expect(reminder).toHaveCount(0);

  await saveARequest(page);
  await expect(reminder).toBeVisible();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(reminder).toHaveCount(0);

  await page.clock.fastForward(4 * DAY);
  await page.reload();
  await expect(page.locator("input.address-url")).toBeVisible();
  await expect(reminder).toHaveCount(0);

  await page.clock.fastForward(2 * DAY);
  await page.reload();
  await expect(reminder).toBeVisible();
});

test("once the browser has promised to keep the data, the status bar says it is kept and a save brings no reminder", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await browserKeeps(page, true);
  await page.goto("/app/");
  // Safari's seven days hold whatever it promised, while the app is not installed (U-165).
  await expect(page.getByRole("contentinfo", { name: "Status" })).toContainText(
    browserName === "webkit" ? "Kept by Safari for 7 days without a visit" : "Kept in this browser",
  );
  await saveARequest(page);
  await expect(page.getByText(/backed up|Back up to keep a copy/)).toHaveCount(0);
});

// U-165: Safari deletes a site's data after seven days without a visit unless the app is installed. Only Settings said
// so; the status bar and the reminder, which an occasional user sees, said only that the browser may delete it.
test("in Safari, the status bar and the reminder say the seven days, and how to keep the data", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "webkit", "Safari's rule: WebKit is the engine that reports Apple's vendor");
  await page.setViewportSize({ width: 1440, height: 900 });
  await browserKeeps(page, false);
  await page.goto("/app/");
  const status = page.getByRole("contentinfo", { name: "Status" });
  await expect(status).toContainText("Kept by Safari for 7 days without a visit");
  await saveARequest(page);
  await expect(
    page.getByRole("status").filter({ hasText: /Safari deletes your data after seven days without a visit/ }),
  ).toBeVisible();
});
