import { test, expect } from "@playwright/test";
import { settled } from "./support/settled";
import { ECHO } from "./support/echo";
import AxeBuilder from "@axe-core/playwright";

// The one exclusion: .monaco-editor, a third-party widget with its own DOM
// and rendering that the app's templates cannot reach.
function buildAxe(page: Parameters<typeof AxeBuilder>[0]["page"]) {
  return new AxeBuilder({ page }).include("body").exclude(".monaco-editor");
}

// Scan only once the page has stopped animating (see settled()).
async function analyze(page: Parameters<typeof AxeBuilder>[0]["page"]) {
  await settled(page);
  return buildAxe(page).analyze();
}

test.describe("Accessibility (primary flows)", () => {
  test("@claim:C-038 composer + response viewer have no critical/serious violations", async ({ page }) => {
    await page.goto("/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    // The status bar carries `.animate-response-arrive` (opacity 0 -> 1,
    // fade-up, over --dur-enter). Scanning immediately after the status
    // badge's text appears can catch the duration/size pills mid-transition,
    // where their interpolated opacity temporarily drops effective text
    // contrast below 4.5:1 even though the token itself (#9C9CA1 on
    // --fill-secondary, 5.31:1) is compliant at rest. Wait for the
    // animation to actually settle instead of scanning a transitional frame.
    await expect(page.locator(".animate-response-arrive").first()).toHaveCSS("opacity", "1");
    // Playwright's click() leaves the cursor exactly where it clicked — it
    // doesn't move away afterwards. The cURL button sits right next to Send
    // in the toolbar, so the cursor can end up resting on/near it, and its
    // tooltip correctly (this isn't a bug) stays open for as long as the
    // cursor stays there. A genuinely-open tooltip with low-contrast default
    // text is a real, if incidental, violation to scan into. Move the mouse
    // well away from any hoverable chrome before scanning, the same way a
    // real user reading the response wouldn't still have their cursor
    // parked on a toolbar button.
    await page.mouse.move(0, 0);
    await expect(page.locator(".mat-mdc-tooltip")).toHaveCount(0);
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    const results = await analyze(page);

    const seriousOrWorse = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(
      seriousOrWorse,
      seriousOrWorse.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);
  });

  test("@claim:C-038 collections sidebar has no critical/serious violations", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New collection" }).click();
    // Scan the settled page, not a frame of the entrance/dialog fade: a
    // half-faded label measured 4.38-4.46:1 while its at-rest colours are
    // ~5.9:1. Self-hosted fonts paint earlier, which made that frame likelier.
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running")
    );

    const results = await analyze(page);

    const seriousOrWorse = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(
      seriousOrWorse,
      seriousOrWorse.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);
  });

  test("@claim:C-038 the Save to Collection and command palette dialogs have no critical/serious violations", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "New collection" }).click();
    await page.locator("#creation-name-input").fill("A11y Save Collection");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("A11y Save Collection", { exact: true })).toBeVisible();
    // Let the creation dialog's own close transition finish — otherwise axe
    // can sample its Create/Cancel buttons mid-fade, where the transitional
    // opacity produces a spurious near-identical fg/bg color reading that
    // has nothing to do with the dialog's actual (already-verified-passing)
    // steady-state contrast.
    await expect(page.locator("#creation-name-input")).toBeHidden();

    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Save to Collection" }).click();
    await expect(page.locator("#save-as-name")).toBeVisible();

    const saveAsResults = await analyze(page);
    const saveAsViolations = saveAsResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(
      saveAsViolations,
      saveAsViolations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);

    await page.keyboard.press("Escape");
    await page.locator("span.type-overline", { hasText: "Collections" }).click();
    await page.keyboard.press("Meta+K");
    await expect(page.getByPlaceholder("Type a command")).toBeVisible();

    const paletteResults = await analyze(page);
    const paletteViolations = paletteResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(
      paletteViolations,
      paletteViolations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);
  });

  test("@claim:C-038 an actually-open confirm dialog has a real accessible name (not just the closed-shell exclusion above)", async ({
    page,
  }) => {
    await page.goto("/");
    // The "Clear all history" confirm is disabled until there's history —
    // send one request first so it's reachable.
    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    await page.getByRole("button", { name: "Request history" }).click();
    await page.getByRole("button", { name: "Clear all history" }).click();

    // The open confirmation is an alert dialog named by its heading and
    // described by its message, and nothing else on the page claims that role.
    const confirm = page.getByRole("alertdialog", { name: "Are you sure?" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toHaveAccessibleDescription("Your entire history will be cleared");
    await expect(page.getByRole("alertdialog")).toHaveCount(1);

    await settled(page);
    const results = await new AxeBuilder({ page }).include('[role="alertdialog"]').analyze();
    const seriousOrWorse = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(seriousOrWorse, seriousOrWorse.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);
  });

  // F47: the popup's Cancel was a "secondary text" button, which in the dark
  // theme was drawn in near-black on a dark surface; the popup had no
  // accessible name and a low-contrast message.
  test("@claim:C-038 the history delete confirmation has no critical/serious violations, in both themes", async ({ page }) => {
    await page.goto("/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?a11y=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    for (const theme of ["dark", "light"]) {
      await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
      await page.getByRole("button", { name: "Request history" }).click();
      await page.getByRole("button", { name: "Delete history entry" }).first().click();
      await expect(page.getByRole("alertdialog").getByRole("button", { name: "Cancel" })).toBeVisible();

      await settled(page);
      const results = await new AxeBuilder({ page }).include('[role="alertdialog"]').analyze();
      const seriousOrWorse = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        seriousOrWorse,
        `${theme}: ` + seriousOrWorse.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")})`).join("\n")
      ).toEqual([]);

      await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "Close history" }).click();
    }
  });

// The claim tests above scan the flows C-038 names. This walks the rest of
// the app in both themes: a colour that passes on one theme's surfaces can
// fail on the other's (status green was 1.85:1 on the light theme's fill).
for (const theme of ["dark", "light"] as const) {
  test(`every view, menu and dialog is free of critical and serious violations in the ${theme} theme`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?sweep=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    const found: string[] = [];
    const scan = async (state: string) => {
      // Off anything with a tooltip: an open one is scanned too, and belongs to no state here.
      await page.mouse.move(640, 880);
      const results = await analyze(page);
      for (const violation of results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")) {
        for (const node of violation.nodes) found.push(`${state}: ${violation.id}: ${node.target.join(" ")} (${node.failureSummary?.split("\n")[1]?.trim() ?? ""})`);
      }
    };
    const button = (name: string) => page.getByRole("button", { name, exact: true });

    await scan("composer and response");
    await button("Common methods").click();
    await scan("method list");
    await page.keyboard.press("Escape");
    await button("Export response").click();
    await scan("export menu");
    await page.keyboard.press("Escape");
    for (const tab of ["Params", "Auth", "Scripts"]) {
      await page.locator("app-composer").getByRole("tab", { name: tab, exact: true }).click();
      await scan(`composer ${tab}`);
    }
    for (const tab of ["Headers", "Timings", "Tests"]) {
      await page.locator("app-response-viewer").getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      await scan(`response ${tab}`);
    }
    for (const opener of ["Request history", "Settings", "Local Bridge settings", "Manage secrets", "New environment", "New collection"]) {
      await button(opener).click();
      await expect(page.getByRole("dialog").first()).toBeVisible();
      await scan(opener);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await scan("phone");
    await button("Toggle sidebar").click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await scan("phone navigation");

    expect(found).toEqual([]);
  });
}
});
