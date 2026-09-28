import { test, expect, type Page } from "@playwright/test";
import { ICON_PATHS } from "../src/app/shared/icon/icon-paths";
import { ECHO } from "./support/echo";

// P0.8 (F18 #75, F33 #90): the app loaded fonts and icons from Google, and
// icon ligature text ("bolt", "light_mode") leaked into accessible names.

// The user's target is the local echo-server (a real server, not a route), so
// the session runs with the service worker active in every engine.
const TARGET = ECHO;

/** Every view a session can open, each followed by an accessibility snapshot. */
async function visitEveryView(page: Page, snapshots: string[]): Promise<void> {
  const snap = async () => snapshots.push(await page.locator("body").ariaSnapshot());
  const panel = page.locator(".p-dialog, .p-drawer").first();
  const open = async (button: string) => {
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(panel).toBeVisible();
    await snap();
    await closeDialog();
  };
  const closeDialog = async () => {
    await page.keyboard.press("Escape");
    await expect(page.locator(".p-dialog-mask, .p-drawer-mask")).toHaveCount(0);
  };

  await snap();
  for (const button of ["Settings", "Request history", "Manage secrets", "Local Bridge settings", "Unlock secrets"]) {
    await open(button);
  }

  for (const tab of ["Params", "Headers", "Auth", "Scripts"]) {
    await page.getByRole("tab", { name: tab, exact: true }).first().click();
    await snap();
  }
}

test("@claim:C-001 no-third-party-requests: a full session talks only to the app and the user's target", async ({ page, context, baseURL }) => {
  const appOrigin = new URL(baseURL ?? "http://localhost:4200").origin;
  const foreign: string[] = [];
  const failed: string[] = [];
  // Context-level, so requests the service worker makes are seen too.
  context.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    const origin = new URL(url).origin;
    if (origin !== appOrigin && origin !== TARGET) foreign.push(url);
  });
  context.on("requestfailed", (request) => failed.push(`${request.url()} ${request.failure()?.errorText}`));

  // Block everything that isn't the app or the target, so the page must load without it.
  await context.route(
    (url) => url.origin !== appOrigin && url.origin !== TARGET,
    (route) => route.abort("blockedbyclient")
  );

  await page.goto("/");
  await page.locator("input.address-url").fill(`${TARGET}/content/json?session=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");

  const snapshots: string[] = [];
  await visitEveryView(page, snapshots);

  expect(foreign).toEqual([]);
  expect(failed).toEqual([]);

  // No control is named after an icon ligature.
  const named = snapshots.join("\n");
  for (const glyph of Object.keys(ICON_PATHS)) {
    expect(named, `a control is named "${glyph}"`).not.toMatch(
      new RegExp(`(button|link|tab|menuitem) "${glyph}"`)
    );
  }
});
