import { test, expect, type Page } from "@playwright/test";
import { axe } from "./support/axe";
import { settled } from "./support/settled";
import { ECHO } from "./support/echo";

// Scan only once the page has stopped animating (see settled()).
async function analyze(page: Page) {
  await settled(page);
  return axe(page).include("body").analyze();
}

test.describe("Accessibility (primary flows)", () => {
  test("@claim:C-038 composer + response viewer have no WCAG 2.2 AA violations", async ({ page }) => {
    await page.goto("/app/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    // The status bar carries `.animate-response-arrive` (opacity 0 -> 1,
    // over --dur-enter). Scanning immediately after the status
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

    const violations = results.violations;
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);
  });

  test("@claim:C-038 collections sidebar has no WCAG 2.2 AA violations", async ({ page }) => {
    await page.goto("/app/");
    await page.getByRole("button", { name: "New collection" }).click();
    // Scan the settled page, not a frame of the entrance/dialog fade: a
    // half-faded label measured 4.38-4.46:1 while its at-rest colours are
    // ~5.9:1. Self-hosted fonts paint earlier, which made that frame likelier.
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running")
    );

    const results = await analyze(page);

    const violations = results.violations;
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);
  });

  test("@claim:C-038 the Save to Collection and command palette dialogs have no WCAG 2.2 AA violations", async ({ page }) => {
    await page.goto("/app/");

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
    const saveAsViolations = saveAsResults.violations;
    expect(
      saveAsViolations,
      saveAsViolations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);

    await page.keyboard.press("Escape");
    await page.locator("span.type-overline", { hasText: "Collections" }).click();
    await page.keyboard.press("Meta+K");
    await expect(page.getByPlaceholder("Type a command")).toBeVisible();

    const paletteResults = await analyze(page);
    const paletteViolations = paletteResults.violations;
    expect(
      paletteViolations,
      paletteViolations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);
  });

  test("@claim:C-038 an actually-open confirm dialog has a real accessible name (not just the closed-shell exclusion above)", async ({
    page,
  }) => {
    await page.goto("/app/");
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
    const results = await axe(page).include('[role="alertdialog"]').analyze();
    const violations = results.violations;
    expect(violations, violations.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);
  });

  // F47: the popup's Cancel was a "secondary text" button, which in the dark
  // theme was drawn in near-black on a dark surface; the popup had no
  // accessible name and a low-contrast message.
  test("@claim:C-038 the history delete confirmation has no WCAG 2.2 AA violations, in both themes", async ({ page }) => {
    await page.goto("/app/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?a11y=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    for (const theme of ["dark", "light"]) {
      await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
      await page.getByRole("button", { name: "Request history" }).click();
      await page.getByRole("button", { name: "Delete history entry" }).first().click();
      await expect(page.getByRole("alertdialog").getByRole("button", { name: "Cancel" })).toBeVisible();

      await settled(page);
      const results = await axe(page).include('[role="alertdialog"]').analyze();
      const violations = results.violations;
      expect(
        violations,
        `${theme}: ` + violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")})`).join("\n")
      ).toEqual([]);

      await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "Close history" }).click();
    }
  });

// The claim tests above scan the flows C-038 names. This walks the rest of
// the app in both themes: a colour that passes on one theme's surfaces can
// fail on the other's (status green was 1.85:1 on the light theme's fill).
for (const theme of ["dark", "light"] as const) {
  test(`every view, menu and dialog is free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
    // The longest test there is: every view, menu and dialog, each scanned. On the WebKit runner of GitHub it takes
    // 66 to 96 s (#228), and 90 s was its limit: it failed for want of time, not for a violation.
    test.setTimeout(240_000);
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?sweep=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    const found: string[] = [];
    const scan = async (state: string) => {
      // Off anything with a tooltip: an open one is scanned too, and belongs to no state here.
      await page.mouse.move(640, 880);
      const results = await analyze(page);
      for (const violation of results.violations) {
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
    // The HAR file, shown before it is written (P4.6 c).
    await page.getByRole("menuitem", { name: "Export as HAR…", exact: true }).click();
    await expect(page.locator(".har-export-preview")).toContainText('"version": "1.2"');
    await scan("export as HAR");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (const tab of ["Params", "Auth", "Scripts"]) {
      await page.locator("app-composer").getByRole("tab", { name: tab, exact: true }).click();
      await scan(`composer ${tab}`);
    }
    for (const tab of ["Headers", "Timings", "Tests"]) {
      await page.locator("app-response-viewer").getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      await scan(`response ${tab}`);
    }
    for (const opener of ["Request history", "Settings", "Local Bridge settings", "Manage secrets", "Environments", "New collection"]) {
      await button(opener).click();
      await expect(page.getByRole("dialog").first()).toBeVisible();
      await scan(opener);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }

    // Settings, pane by pane: its list, and each section's own controls.
    await button("Settings").click();
    const appSettings = page.getByRole("dialog", { name: "Settings", exact: true });
    for (const section of ["Requests", "History", "Data and storage", "Vault", "Local Bridge", "Shortcuts", "Diagnostics", "About", "Danger zone"]) {
      await appSettings.getByRole("navigation").getByRole("button", { name: section, exact: true }).click();
      await expect(appSettings.getByRole("heading", { name: section, exact: true })).toBeVisible();
      await scan(`settings ${section}`);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // A collection's settings (P4.9), tab by tab, and the Auth tab's line for a request that inherits.
    await button("New collection").click();
    await page.locator("#creation-name-input").fill("Sweep");
    await button("Create").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByText("Sweep", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: /^Collection settings/ });
    for (const tab of ["Auth", "Variables", "Scripts", "Route"]) {
      await settings.getByRole("tab", { name: tab }).click();
      await scan(`collection settings ${tab}`);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The Postman export of a collection (P4.6 b).
    await page.getByText("Sweep", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Export for Postman…" }).click();
    await expect(page.getByRole("dialog", { name: "Export for Postman" }).getByRole("button", { name: "Export file" })).toBeVisible();
    await scan("export for Postman");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The environments, and their export with the file for Postman chosen: it then asks which environment.
    await button("Environments").click();
    await button("New environment").click();
    await scan("new environment");
    await page.locator("#new-env-name-input").fill("Swept env");
    await button("Create environment").click();
    await expect(page.locator("#new-env-name-input")).toHaveCount(0);
    await scan("environments, one open");
    await button("Export environments").click();
    const environments = page.getByRole("dialog", { name: "Export environments" });
    await environments.getByRole("radio", { name: "Postman" }).click();
    await expect(environments.getByRole("combobox", { name: "Environment" })).toContainText("Swept env");
    await scan("export environments, file for Postman");
    await page.keyboard.press("Escape");
    await expect(environments).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.locator("app-composer").getByRole("tab", { name: "Auth", exact: true }).click();
    await page.locator("app-composer").getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "Inherit from parent" }).click();
    await expect(page.locator(".auth-inherited")).toBeVisible();
    await scan("composer Auth, inherited");
    // OAuth 2.0 (P4.7): the fields of the password grant, which has the most, and the token's panel.
    await page.locator("app-composer").getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "OAuth 2.0", exact: true }).click();
    await page.locator("app-composer").getByRole("combobox", { name: "Grant" }).click();
    await page.getByRole("option", { name: "Password (legacy)" }).click();
    await expect(page.locator(".oauth-token-status")).toBeVisible();
    await scan("composer Auth, OAuth 2.0");

    // The import report (P4.1), with a warning in it.
    const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
    const imported = {
      $id: "wayfarer/collection",
      meta: meta("file"),
      collection: { id: "col-a11y", meta: meta("col-a11y"), name: "Swept import", order: 0, variables: [], auth: { type: "none" }, scripts: { pre: "pm.vault.get('k')", post: "" } },
      folders: [],
      requests: [],
    };
    await page.locator('app-collections-sidebar input[type="file"]').setInputFiles({ name: "swept.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
    await expect(page.getByRole("dialog", { name: "Import collection" }).locator(".import-warnings")).toBeVisible();
    await scan("import report");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The box for a pasted cURL command (P4.5).
    await button("Import a cURL command").click();
    await expect(page.getByRole("dialog", { name: "Import" }).getByLabel("A cURL command")).toBeVisible();
    await scan("import, paste a cURL command");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await scan("phone");
    await button("Toggle sidebar").click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await scan("phone navigation");

    expect(found).toEqual([]);
  });
}
});
