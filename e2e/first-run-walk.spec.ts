import { expect, test, type Page } from "@playwright/test";
import { axe } from "./support/axe";

// BB1: after a profile's first example, a short inline walk of the route strip's three stops. Once.

const KEY = "wayfarer:first-walk";

test.use({ serviceWorkers: "block" });

async function answerExample(page: Page): Promise<void> {
  await page.route(
    (url) => url.protocol === "https:",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: '{"id":1}',
      }),
  );
}

async function tryExample(page: Page): Promise<void> {
  await answerExample(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await page.locator(".response-pane").getByRole("button", { name: "Try an example" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");
}

const walk = (page: Page) => page.getByRole("region", { name: "How this request travelled" });
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), KEY);

test("@claim:C-121 the first example is followed by a walk of the strip that takes no focus, ends with Escape or Dismiss, is shown once, and returns after Reset all data", async ({
  page,
}) => {
  await tryExample(page);
  const region = walk(page);
  await expect(region).toBeVisible();
  // Not a dialog or an overlay: nothing is inert, and focus did not move into it.
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  expect(await region.evaluate((node) => node.contains(document.activeElement))).toBe(false);
  const said = page.getByRole("status").filter({ hasText: "It left from this page" });
  await expect(said).toHaveCount(1);

  await region.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("status").filter({ hasText: "masked wherever Wayfarer keeps it" })).toHaveCount(1);
  // From the keyboard: Safari does not focus a button on a click, so focus it, and Enter takes the next stop.
  await region.getByRole("button", { name: "Next" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: /It arrived at \S+\. The response is below\./ })).toHaveCount(
    1,
  );
  expect(await stored(page)).toBeNull();
  await region.getByRole("button", { name: "Done" }).click();
  await expect(region).toHaveCount(0);
  expect(await stored(page)).not.toBeNull();

  // Not again: the same send in a reloaded page.
  await page.reload();
  await page.locator("input.address-url").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect(region).toHaveCount(0);
});

test("Escape ends the walk, and Dismiss does too", async ({ page }) => {
  await tryExample(page);
  await expect(walk(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(walk(page)).toHaveCount(0);
  expect(await stored(page)).not.toBeNull();
});

test("a dialog that takes Escape keeps the walk", async ({ page }) => {
  await tryExample(page);
  await expect(walk(page)).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(walk(page)).toBeVisible();
});

test("a profile that finished it is not shown the walk after the example", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "1"), KEY);
  await tryExample(page);
  await expect(walk(page)).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`the walk is free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await tryExample(page);
    await expect(walk(page)).toBeVisible();
    expect((await axe(page).analyze()).violations).toEqual([]);
  });
}
