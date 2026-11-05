import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { openSettings } from "./support/app";

test.describe("Settings surface", () => {
  const drawn = (page: import("@playwright/test").Page) =>
    page.evaluate(() => document.documentElement.getAttribute("data-theme"));

  for (const theme of ["light", "dark"] as const) {
    test(`with ${theme} chosen, the page is ${theme} from the moment it has a body: it is never drawn in the other theme first (F85)`, async ({
      page,
    }) => {
      // Stored, not emulated: see the note on Firefox below. The theme is read when the body appears, which is
      // before anything is drawn, and at every change of the attribute after that.
      await page.addInitScript((choice) => {
        localStorage.setItem("wayfarer:theme", choice);
        const seen: (string | null)[] = [];
        (window as unknown as { themesSeen: typeof seen }).themesSeen = seen;
        const record = () => seen.push(document.documentElement.getAttribute("data-theme"));
        const waitForBody = new MutationObserver(() => {
          if (!document.body) return;
          waitForBody.disconnect();
          record();
          new MutationObserver(record).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"],
          });
        });
        waitForBody.observe(document, { childList: true, subtree: true });
      }, theme);
      await page.goto("/app/");
      await expect(page.locator("input.address-url")).toBeVisible();
      const seen = await page.evaluate(() => (window as unknown as { themesSeen: (string | null)[] }).themesSeen);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.filter((value) => value !== theme)).toEqual([]);
    });
  }

  test("@claim:C-033 @claim:C-037 opens from the toolbar, and the theme is Light, Dark or the system's, kept over a reload", async ({
    page,
  }) => {
    await page.goto("/app/");
    // No choice yet: the system's. (Set once the page is there: Playwright's Firefox does not give a
    // page its emulated scheme on a context's first load, and gives it from then on.)
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => drawn(page)).toBe("dark");

    const dialog = await openSettings(page);
    const theme = dialog.getByRole("radiogroup", { name: "Theme" });
    await expect(theme.getByRole("radio", { name: "System" })).toBeChecked();
    await theme.getByRole("radio", { name: "Light" }).click();
    await expect.poll(() => drawn(page)).toBe("light");
    await page.reload();
    await expect.poll(() => drawn(page)).toBe("light");

    // System again: it follows the device, and changes when the device does.
    await (
      await openSettings(page)
    )
      .getByRole("radiogroup", { name: "Theme" })
      .getByRole("radio", { name: "System" })
      .click();
    await expect.poll(() => drawn(page)).toBe("dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => drawn(page)).toBe("light");
  });

  test("@claim:C-033 every section is one click from the list, and each shows its own pane", async ({ page }) => {
    await page.goto("/app/");
    const dialog = await openSettings(page);
    const list = dialog.getByRole("navigation", { name: "Settings sections" });
    await expect(list.getByRole("button")).toHaveText([
      /General/,
      /History/,
      /Data and storage/,
      /Vault/,
      /Local Bridge/,
      /AI/,
      /Cookies/,
      /Shortcuts/,
      /Diagnostics/,
      /About/,
      /Danger zone/,
    ]);
    for (const [section, control] of [
      ["General", "Request timeout"],
      ["History", "History size"],
      ["Vault", "Lock the vault when idle"],
      ["Local Bridge", "Bridge address"],
    ] as const) {
      await list.getByRole("button", { name: section, exact: true }).click();
      await expect(list.getByRole("button", { name: section, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(dialog.getByLabel(control)).toBeVisible();
    }
    // The pane before is gone, not hidden under the new one.
    await expect(dialog.getByLabel("Request timeout")).toHaveCount(0);
    // The list is walked with the arrow keys.
    await list.getByRole("button", { name: "General", exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(list.getByRole("button", { name: "History", exact: true })).toBeFocused();
    await page.keyboard.press("End");
    await expect(list.getByRole("button", { name: "Danger zone", exact: true })).toBeFocused();
  });

  test("on a phone Settings is the list, a section opens in its place, and All settings goes back", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/");
    await page.getByRole("banner").getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    const list = dialog.getByRole("navigation", { name: "Settings sections" });
    await expect(list).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "General", exact: true })).toBeHidden();

    await list.getByRole("button", { name: "History", exact: true }).click();
    await expect(list).toBeHidden();
    await expect(dialog.getByLabel("History size")).toBeVisible();
    const back = dialog.getByRole("button", { name: "All settings" });
    await expect(back).toBeFocused();
    // Nothing is wider than the dialog, and the dialog is inside the window.
    expect(
      await dialog.evaluate((element) =>
        Math.max(...[...element.querySelectorAll("*")].map((child) => child.getBoundingClientRect().right)),
      ),
    ).toBeLessThanOrEqual(390);

    await back.click();
    await expect(list).toBeVisible();
    await expect(list.getByRole("button", { name: "History", exact: true })).toBeFocused();
  });

  test("@claim:C-030 opens from the command palette", async ({ page }) => {
    await page.goto("/app/");
    await page.keyboard.press("ControlOrMeta+K");
    await page.getByPlaceholder("Search or run a command").fill("Settings");
    await page.getByRole("option", { name: "Settings", exact: true }).click();
    await expect(page.getByPlaceholder("Search or run a command")).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  });

  test("@claim:C-033 lists keyboard shortcuts, including live command palette actions", async ({ page }) => {
    await page.goto("/app/");
    const dialog = await openSettings(page, "Shortcuts");

    await expect(dialog.getByText("Open the command palette")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Everything the command palette can do" })).toBeVisible();
    // A command's keys come from the palette's list (U-032).
    const send = dialog.locator(".settings-row").filter({ hasText: "Send request" });
    await expect(send.locator("kbd")).toHaveText(/^(⌘↵|Ctrl\+Enter)$/);
    await expect(dialog.getByText("Local Bridge settings", { exact: true })).toBeVisible();
  });

  // U-166 of docs/design/audit.md: the app links to its documentation, the site's pages beside it.
  test("About and the command palette open the documentation, the site's page beside the app", async ({
    page,
    context,
  }) => {
    await page.goto("/app/");
    const dialog = await openSettings(page, "About");
    const link = dialog.getByRole("link", { name: /^Documentation/ });
    await expect(link).toHaveAttribute("href", "../docs/");
    const [docs] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await docs.waitForLoadState();
    expect(new URL(docs.url()).pathname).toBe("/docs/");
    await expect(docs.getByRole("heading", { level: 1 })).toBeVisible();
    await docs.close();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+K");
    await page.getByRole("combobox", { name: /^Search requests/ }).fill("documentation");
    const [fromPalette] = await Promise.all([context.waitForEvent("page"), page.keyboard.press("Enter")]);
    await fromPalette.waitForLoadState();
    expect(new URL(fromPalette.url()).pathname).toBe("/docs/");
  });

  // U-178 of docs/design/audit.md: the tree's and the tabs' own keys are written where every shortcut is.
  test("Shortcuts lists F2, Alt with an arrow and Shift+F10, the keys of the tree and the tabs", async ({ page }) => {
    await page.goto("/app/");
    const dialog = await openSettings(page, "Shortcuts");
    const keysOf = (text: string) => dialog.locator(".settings-row").filter({ hasText: text }).locator("kbd");
    await expect(keysOf("Rename the item selected in the collections panel, or the focused tab")).toHaveText("F2");
    await expect(keysOf("Move the selected item up or down among its siblings")).toHaveText(/^(⌥↑ ⌥↓|Alt\+↑ Alt\+↓)$/);
    await expect(keysOf("Open the menu of the selected item or the focused tab")).toHaveText(/^(⇧F10|Shift\+F10)$/);
  });

  test("@claim:C-033 Reset All Data requires confirmation and is reachable from Settings", async ({ page }) => {
    await page.goto("/app/");
    await openSettings(page, "Danger zone");
    await page.getByRole("button", { name: "Reset all data" }).click();

    await expect(page.getByText("Reset all data?")).toBeVisible();
    // Cancel — this test only verifies the action is wired and gated behind
    // a real confirmation, not that data actually gets destroyed.
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Reset all data?")).toBeHidden();
  });

  // U-185 of docs/design/audit.md: the row that says "back up first" offers the backup there, the one Data and
  // storage makes, and nothing is reset by it.
  test("the Danger zone backs up the workspace beside Reset all data", async ({ page }) => {
    await page.goto("/app/");
    const dialog = await openSettings(page, "Danger zone");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Back up workspace" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("wayfarer-workspace.json");
    const file = JSON.parse(readFileSync(await download.path(), "utf8")) as { $id: string; stores: object };
    expect(file.$id).toBe("wayfarer/workspace");
    // The reset beside it deletes the history too, so this backup keeps it.
    expect(Object.keys(file.stores)).toContain("history");
    await expect(page.getByText("Reset all data?")).toHaveCount(0);
  });

  test("@claim:C-033 Local Bridge settings are a pane of Settings: nothing is stored until Save, and the toolbar's bridge button opens it", async ({
    page,
  }) => {
    await page.goto("/app/");
    const dialog = await openSettings(page, "Local Bridge");
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();
    await dialog.getByLabel("Bridge token", { exact: true }).fill("a-token-typed-here");
    expect(await page.evaluate(() => localStorage.getItem("wayfarer:bridge"))).toBeNull();
    await save.click();
    await expect(dialog.locator(".bridge-saved")).toHaveText(/Saved/);
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem("wayfarer:bridge"))) ?? "{}")).toEqual({
      route: "auto",
      url: "http://127.0.0.1:7717",
    });
    // The token is not stored there (F83): `e2e/bridge-token.spec.ts` has where it is.
    // Nothing listens there in this test: the pane says so, and why it may be.
    await dialog.getByRole("button", { name: "Test connection" }).click();
    await expect(dialog.locator(".bridge-test")).toContainText("Not reachable. Is the bridge running");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: /^Route: / }).click();
    await expect(dialog.getByRole("heading", { name: "Local Bridge", exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Bridge address")).toHaveValue("http://127.0.0.1:7717");
  });

  test("@claim:C-033 exports environments as a JSON file", async ({ page }) => {
    await page.goto("/app/");
    await openSettings(page, "Data and storage");

    const downloadPromise = page.waitForEvent("download");
    // Scoped: the environments panel has its own "Export environments" button.
    await page.getByRole("dialog").getByRole("button", { name: "Export environments" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("environments-export.json");
  });

  test("shows the app version from package.json (P0.11)", async ({ page }) => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    await page.goto("/app/");
    const dialog = await openSettings(page, "About");
    await expect(page.getByTestId("app-version")).toHaveText(version);
    // The licences are a file of the app itself; the other links leave it, each in a tab of its own.
    await expect(dialog.getByRole("link", { name: /Licences/ })).toHaveAttribute("href", "3rdpartylicenses.txt");
    for (const link of await dialog.getByRole("link").all())
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("the device's route is a real choice: the keyboard and a click both pick one (P6.4; it was a checkbox)", async ({
    page,
  }) => {
    await page.goto("/app/");
    await page.getByRole("button", { name: /^Route: / }).click();
    const auto = page.getByRole("radio", { name: "Auto" });
    const direct = page.getByRole("radio", { name: "Direct" });
    await expect(page.getByRole("radiogroup", { name: "Route" })).toBeVisible();
    await expect(auto).toBeChecked();

    await auto.focus();
    await page.keyboard.press("ArrowRight");
    await expect(direct).toBeChecked();
    await expect(direct).toBeFocused();

    await page.getByRole("radio", { name: "Local Bridge" }).click();
    await expect(page.getByRole("radio", { name: "Local Bridge" })).toBeChecked();
    await expect(auto).not.toBeChecked();
  });

  test("a button reached with the keyboard shows the focus ring", async ({ page, browserName }) => {
    await page.goto("/app/");
    // With an address, the button after it (Copy as cURL) is enabled and takes the key.
    await page.locator("input.address-url").fill("https://api.example.test/");
    await page.locator("input.address-url").focus();
    // Safari moves focus to buttons with Option+Tab unless the user changed the default.
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");

    const focused = page.locator(":focus");
    await expect(focused).toHaveRole("button");
    expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    expect(await focused.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
  });
});

// U-053: WebKit drew the focus ring on a dialog's first control when a click opened it: focus set by code was the
// keyboard's to it. A click opens Settings with no ring; the keyboard opens it with one.
test("a dialog opened by a click shows no focus ring until a key is pressed in it; one opened by a key is not quieted", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const settings = page.getByRole("banner").getByRole("button", { name: "Settings", exact: true });
  // The ring that is drawn, not the browser's opinion of focus-visible: WebKit's says yes after a click.
  const ringed = () =>
    page.evaluate(
      () => (document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : "none") !== "none",
    );
  await settings.click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(true);
  expect(await ringed()).toBe(false);
  // The keyboard is in use now: the ring is drawn where Tab goes.
  await page.keyboard.press("Tab");
  await expect.poll(ringed).toBe(true);
  // Escape gives focus back to Settings; Enter opens it again, and nothing quiets the ring.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toHaveAttribute("data-quiet-focus");
});

// U-057: Firefox and WebKit drew their own arrows in every number field. None is drawn; the keys still step it.
test("a number field draws no arrows of the browser's, and the arrow keys still step it", async ({ page }) => {
  await page.goto("/app/");
  const dialog = await openSettings(page, "General");
  const timeout = dialog.getByLabel("Request timeout");
  expect(await timeout.evaluate((input) => getComputedStyle(input).appearance)).toBe("textfield");
  await timeout.focus();
  await page.keyboard.press("ArrowUp");
  await expect(timeout).toHaveValue("1000");
});
