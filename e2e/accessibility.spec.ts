import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Exclusions for known, confirmed third-party-library internals this app's
// own templates/attributes cannot reach — not a way to dodge app-fixable
// issues, each one was actually investigated first:
//
// - .monaco-editor: third-party widget, entirely its own DOM/rendering.
// - [data-pc-section="firstfocusableelement"/"lastfocusableelement"]:
//   PrimeNG's own focus-trap boundary sentinels (aria-hidden and
//   role="presentation" already, but shipped with tabindex="0" upstream).
// - p-confirmdialog's host p-dialog: PrimeNG's ConfirmDialog renders an
//   inner <p-dialog role="alertdialog" data-pc-section="host"> that keeps
//   `role="alertdialog"` on its host wrapper *unconditionally*, even while
//   fully closed (content collapses to an empty <!--container--> comment).
//   Tried, in order: a raw aria-label attribute (rejected by
//   aria-prohibited-attr since the host itself carries no role at the
//   binding surface Angular sees), [ariaLabelledBy] (not a real ConfirmDialog
//   input — that property only exists on the plain Dialog component),
//   two different [pt] pass-through paths (root.root, root.host) traced
//   directly from PrimeNG's compiled source, and a static `header` input
//   (confirmed to genuinely forward to the inner p-dialog's own [header]
//   binding, but only takes effect on content the dialog renders while
//   open — the *closed* host wrapper's role attribute isn't conditional on
//   that at all). This is a real upstream gap: a dormant, empty dialog
//   shouldn't carry an interactive ARIA role in the first place. When it's
//   actually open (mid-confirm), it does have a real accessible name via
//   the message content — this exclusion only hides the false positive
//   from the closed, inactive shell present on every page load.
// - .p-splitter-gutter: PrimeNG's Splitter (used for the resizable composer/
//   response layout, Phase 3) hardcodes [attr.aria-orientation]/
//   [attr.aria-valuenow] onto the *handle* sub-element
//   (.p-splitter-gutter-handle) inside its own compiled template, while the
//   role="separator" (which is what actually requires aria-valuenow per
//   aria-required-attr, and disallows aria-orientation/aria-valuenow on
//   whatever *doesn't* carry that role per aria-allowed-attr) lives one
//   level up on the parent .p-splitter-gutter. Confirmed directly in
//   node_modules/primeng/fesm2022/primeng-splitter.mjs — both attributes
//   are fixed template bindings on the wrong element, not exposed through
//   any input or reachable via the [pt] pass-through API (which can only
//   add attributes, not relocate/remove template-hardcoded ones). A real
//   upstream bug, not an app-fixable one.
function buildAxe(page: Parameters<typeof AxeBuilder>[0]["page"]) {
  return new AxeBuilder({ page })
    .include("body")
    .exclude(".monaco-editor")
    .exclude('[data-pc-section="firstfocusableelement"]')
    .exclude('[data-pc-section="lastfocusableelement"]')
    .exclude("p-confirmdialog p-dialog")
    .exclude("p-confirmDialog p-dialog")
    .exclude(".p-splitter-gutter");
}

test.describe("Accessibility (primary flows)", () => {
  test("composer + response viewer have no critical/serious violations", async ({ page }) => {
    await page.goto("/");
    await page.locator("input.address-url").fill("https://jsonplaceholder.typicode.com/todos/1");
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
    // `pTooltip` correctly (this isn't a bug) stays open for as long as the
    // cursor stays there. A genuinely-open tooltip with low-contrast default
    // text is a real, if incidental, violation to scan into. Move the mouse
    // well away from any hoverable chrome before scanning, the same way a
    // real user reading the response wouldn't still have their cursor
    // parked on a toolbar button.
    await page.mouse.move(0, 0);
    await expect(page.locator(".p-tooltip")).toHaveCount(0);

    const results = await buildAxe(page).analyze();

    const seriousOrWorse = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(
      seriousOrWorse,
      seriousOrWorse.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);
  });

  test("collections sidebar has no critical/serious violations", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New collection" }).click();

    const results = await buildAxe(page).analyze();

    const seriousOrWorse = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(
      seriousOrWorse,
      seriousOrWorse.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);
  });

  test("the Save to Collection and command palette dialogs have no critical/serious violations", async ({ page }) => {
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

    await page.locator("input.address-url").fill("https://jsonplaceholder.typicode.com/todos/1");
    await page.getByRole("button", { name: "Save to Collection" }).click();
    await expect(page.locator("#save-as-name")).toBeVisible();

    const saveAsResults = await buildAxe(page).analyze();
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

    const paletteResults = await buildAxe(page).analyze();
    const paletteViolations = paletteResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(
      paletteViolations,
      paletteViolations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")
    ).toEqual([]);
  });

  test("an actually-open confirm dialog has a real accessible name (not just the closed-shell exclusion above)", async ({
    page,
  }) => {
    await page.goto("/");
    // The "Clear all history" confirm is disabled until there's history —
    // send one request first so it's reachable.
    await page.locator("input.address-url").fill("https://jsonplaceholder.typicode.com/todos/1");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    await page.getByRole("button", { name: "Request history" }).click();
    await page.getByRole("button", { name: "Clear all history" }).click();

    // Deliberately does NOT use buildAxe()'s "body" root — this test exists
    // specifically to inspect every alertdialog-role node on the page. That
    // surfaces two closed, empty shells that are collateral, not the dialog
    // under test:
    //  - ConfirmDialog itself renders TWO internal <p-dialog> children (only
    //    one of which — pc52/pc61 style markers vary by mount — is ever the
    //    "live" one at a time), and BOTH always carry role="alertdialog" on
    //    their host tag even while permanently empty (`<!--container-->`).
    //    This is the same closed-shell case documented above for p-dialog.
    //  - The history list's own per-row p-confirmpopup (delete-request
    //    affordance) has the identical pattern: its closed portal-rendered
    //    root also keeps role="alertdialog" unconditionally.
    // The actual open dialog is rendered via a separate CDK-style portal that
    // is NOT a DOM descendant of <p-confirmdialog>, so it's unaffected by
    // either dormant shell above.
    //
    // AxeBuilder#exclude can't remove these two: axe-core's context
    // resolution only prunes exclude matches that are *descendants* of an
    // include root — it can't drop the include-root node itself, which is
    // exactly what happens here since `[role="alertdialog"]` matches these
    // dormant elements directly. So the known-dormant nodes are filtered out
    // of the results in JS instead, and we assert nothing real is left over.
    const results = await new AxeBuilder({ page }).include('[role="alertdialog"]').analyze();
    const nameViolations = results.violations.filter((v) => v.id === "aria-dialog-name");
    // A dormant shell's entire content collapses to a single Angular comment
    // placeholder (`<!--container-->`, or sometimes just an empty `<!---->` —
    // the exact text isn't meaningful, only that there's no real rendered
    // content). Match structurally (element whose only child is an HTML
    // comment) rather than one specific comment string, since more surfaces
    // ship this exact PrimeNG closed-shell pattern over time (Secrets
    // Manager's and Settings' own confirm dialogs, as of this pass) and each
    // one's placeholder comment text isn't something this test should have
    // to enumerate by hand.
    const isKnownDormantShell = (html: string) =>
      /<!--[^>]*--><\/[a-zA-Z][\w-]*>\s*$/.test(html) || html.includes("p-confirmpopup");
    const unexpectedNodes = nameViolations
      .flatMap((v) => v.nodes)
      .filter((n) => !isKnownDormantShell(n.html));
    expect(unexpectedNodes).toEqual([]);
  });
});
