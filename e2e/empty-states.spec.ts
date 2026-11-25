import { expect, test, type Locator, type Page } from "@playwright/test";
import { closeEnvironments, openEnvironments, openPalette, send } from "./support/app";
import { axe } from "./support/axe";
import { ECHO } from "./support/echo";

// BB1: each place with nothing yet draws the strip's path small, a headline, one sentence and its action.

/** The state's picture, headline, sentence and the one action it names, all in one `app-empty-state`. */
async function expectEmptyState(place: Locator, headline: string, action: string): Promise<Locator> {
  const state = place.locator("app-empty-state");
  await expect(state).toHaveCount(1);
  await expect(state.locator("app-route-glyph svg")).toHaveCount(1);
  await expect(state.getByRole("heading", { name: headline })).toBeVisible();
  await expect(state.getByRole("heading", { name: headline })).toHaveClass(/type-empty-title/);
  await expect(state.getByRole("button", { name: action, exact: true })).toBeVisible();
  // A sentence (the response adds a note on the example), and the path is a picture: not read, not a link, nothing in it takes focus.
  await expect(state.locator("p").first()).toBeVisible();
  await expect(state.locator("app-route-glyph")).toHaveAttribute("aria-hidden", "true");
  return state;
}

test("@claim:C-122 collections, history, environments, the response, the vault, secrets, tests and a lone history entry each draw the path, one sentence and their action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await expectEmptyState(page.locator("app-collections-sidebar"), "No collections yet.", "New collection");
  await expectEmptyState(page.locator(".response-pane"), "Send a request to see what comes back.", "Try an example");

  // The vault, from the palette (the status bar has no Secrets before a vault); its action sets one up, and then
  // the dialog's list is empty.
  await (await openPalette(page)).fill("Secrets");
  await page.keyboard.press("Enter");
  const secrets = page.getByRole("dialog", { name: "Secrets", exact: true });
  const vault = await expectEmptyState(secrets, "No vault yet.", "Set up vault");
  await vault.getByRole("button", { name: "Set up vault", exact: true }).click();
  const setup = page.getByRole("dialog", { name: "Set up vault", exact: true });
  await setup.locator("input[type='password']").nth(0).fill("correct horse battery staple");
  await setup.locator("input[type='password']").nth(1).fill("correct horse battery staple");
  await setup.getByRole("button", { name: "Set up vault", exact: true }).click();
  await expect(setup).toHaveCount(0);
  await expectEmptyState(secrets, "No secrets yet.", "Open Environments");
  await page.keyboard.press("Escape");
  await expect(secrets).toHaveCount(0);

  await page.getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByRole("dialog", { name: "History", exact: true });
  await expectEmptyState(history, "Nothing sent yet.", "Send a request");
  await history.getByRole("button", { name: "Close history" }).click();

  const environments = await openEnvironments(page);
  await expectEmptyState(environments, "No environments yet.", "New environment");

  // A request sent: its Tests tab has none, and its history entry has nothing to compare with.
  await closeEnvironments(page);
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  const viewer = page.locator("app-response-viewer");
  await viewer.getByRole("tab", { name: /^Tests/ }).click();
  await expectEmptyState(viewer, "No tests on this request.", "Add a test");

  await page.getByRole("button", { name: "History", exact: true }).click();
  await history.getByRole("button", { name: "Details" }).first().click();
  await expectEmptyState(history, "Nothing to compare yet.", "Open it to send again");
});

test("an empty place has no animation and no focus stop of its own in its picture", async ({ page }) => {
  await page.goto("/app/");
  const state = page.locator("app-collections-sidebar app-empty-state");
  await expect(state).toBeVisible();
  expect(await state.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  expect(await state.locator("app-route-glyph [tabindex], app-route-glyph a, app-route-glyph button").count()).toBe(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`the first screen's empty places are free of WCAG 2.2 AA violations in the ${theme} theme`, async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await expect(page.locator("app-collections-sidebar app-empty-state")).toBeVisible();
    await expect(page.locator(".response-pane app-empty-state")).toBeVisible();
    expect((await axe(page).analyze()).violations).toEqual([]);
  });
}

test("the palette reaches the secrets dialog's empty state without a vault", async ({ page }) => {
  await page.goto("/app/");
  const field = await openPalette(page);
  await field.fill("Secrets");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Secrets", exact: true }).locator("app-empty-state")).toBeVisible();
});
