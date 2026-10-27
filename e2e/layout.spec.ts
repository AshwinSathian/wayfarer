import { test, expect } from "@playwright/test";
import { openEnvironments } from "./support/app";
import { ECHO } from "./support/echo";

test.describe("Resizable composer/response layout (desktop)", () => {
  test("shows a resizable split between the composer and the response viewer", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");

    // Before any response exists, the response pane shows its own empty state.
    await expect(page.getByText("Send a request and its response shows here.")).toBeVisible();

    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    const splitter = page.locator(".composer-response-splitter");
    await expect(splitter).toBeVisible();
    await expect(splitter.getByRole("separator")).toBeVisible();
    await expect(page.locator("app-response-viewer")).toBeVisible();
  });

  test("@claim:C-031 persists the chosen split ratio across a reload", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    const gutter = page.locator(".composer-response-splitter").getByRole("separator");
    const composer = page.locator(".composer-pane");
    const gutterBox = await gutter.boundingBox();
    expect(gutterBox).not.toBeNull();
    const widthBefore = (await composer.boundingBox())!.width;

    // Drag the gutter a meaningful distance to the right.
    await page.mouse.move(gutterBox!.x + gutterBox!.width / 2, gutterBox!.y + gutterBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(gutterBox!.x + 160, gutterBox!.y + gutterBox!.height / 2, { steps: 10 });
    await page.mouse.up();

    const widthAfter = (await composer.boundingBox())!.width;
    expect(widthAfter).toBeGreaterThan(widthBefore + 100);
    const stateKey = await page.evaluate(() => localStorage.getItem("wayfarer:composer-split"));
    expect(stateKey).not.toBeNull();

    await page.reload();
    const stateKeyAfterReload = await page.evaluate(() => localStorage.getItem("wayfarer:composer-split"));
    expect(stateKeyAfterReload).toBe(stateKey);
    // The stored ratio is applied, not only kept.
    await expect.poll(async () => Math.abs((await composer.boundingBox())!.width - widthAfter)).toBeLessThan(2);
  });

  test("opening an editor tab does not make the page wider than the window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?wide=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    await page.getByRole("tab", { name: "Scripts", exact: true }).first().click();
    await expect(page.getByText("Loading editor…")).toHaveCount(0);
    // The editor sizes itself to its container: a container that sizes itself to the editor grows without end.
    await page.waitForTimeout(1000);
    const splitter = page.locator(".composer-response-splitter");
    expect((await splitter.boundingBox())!.width).toBeLessThanOrEqual(1440);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  // The composer ran 49 px past the window (no box-sizing reset), and below
  // 1024 px the toolbar was wider than the space beside the pinned sidebar.
  for (const width of [1440, 1220, 1200, 1024, 900, 820, 768, 767, 640, 420, 390, 360, 320]) {
    test(`nothing is wider than a ${width} px window`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");
      await expect(page.locator("input.address-url")).toBeVisible();

      // Not wider; WebKit reports it narrower by the 5 px vertical scrollbar.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const send = await page.getByRole("button", { name: "Send request" }).boundingBox();
      expect(send!.x + send!.width).toBeLessThanOrEqual(width);
    });

    // Beside the pinned sidebar, from 768 to about 1000 px, the address row had
    // no room for the URL and its buttons on one line: the field shrank to 16 px.
    test(`the URL field has room to type in at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");
      const url = await page.locator("input.address-url").boundingBox();
      // The narrowest it gets by design is on a 360 px phone: about 120 px.
      expect(url!.width).toBeGreaterThanOrEqual(100);
    });
  }

  // D3.3e: in a 390 px window the export's three choices ran past the dialog's edge, and
  // "Plain text" was cut off; fitted to the dialog by clipping, "With the vault" lost its edge.
  for (const width of [360, 390]) {
    test(`the export's choices fit in the dialog, each in its option, at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");
      await openEnvironments(page);
      await page.getByRole("button", { name: "New environment" }).first().click();
      await page.locator("#new-env-name-input").fill("Phone");
      await page.getByRole("button", { name: "Create environment" }).click();
      await page.getByRole("button", { name: "Export environments" }).click();
      const dialog = page.getByRole("dialog", { name: "Export environments" });
      const choices = dialog.getByRole("radiogroup", { name: "Protected variables" });
      await expect(choices.getByRole("radio", { name: "Leave out" })).toBeChecked();
      const fits = await choices.evaluate((group) => {
        const room = group.parentElement!.getBoundingClientRect();
        const track = group.getBoundingClientRect();
        const options = [...group.querySelectorAll(".segment")].map((option) => {
          const [box, text] = [
            option.getBoundingClientRect(),
            option.querySelector(".segment-label")!.getBoundingClientRect(),
          ];
          return text.left >= box.left && text.right <= box.right;
        });
        return { track: track.left >= room.left && track.right <= room.right, options };
      });
      expect(fits).toEqual({ track: true, options: [true, true, true] });
    });
  }

  // F80: the environments view was one grid column as wide as its widest text, so a long
  // name made the list 621 px wide in a 390 px window and its buttons could not be reached.
  test("a long environment name is cut short, and its row's buttons stay inside a 390 px window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await openEnvironments(page);
    await page.getByRole("button", { name: "New environment" }).first().click();
    await page.locator("#new-env-name-input").fill("A much longer environment name that has to be cut somewhere");
    await page.getByRole("button", { name: "Create environment" }).click();
    await expect(page.locator("#new-env-name-input")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 900 });
    for (const name of [
      "Delete A much longer environment name that has to be cut somewhere",
      "Import environments",
      "Add variable",
    ]) {
      // Polled: the page is laid out again a frame or two after the window changes.
      await expect
        .poll(
          async () =>
            page.getByRole("button", { name, exact: true }).evaluate((button) => button.getBoundingClientRect().right),
          { message: name },
        )
        .toBeLessThanOrEqual(390);
    }
  });

  // F82: on a phone a history row is a panel's header, and its URL was not cut short there:
  // a long one pushed the header's chevron to x = 1355 in a 390 px window, out of sight.
  test("a long URL in a phone's history row is cut short, and the row's chevron stays inside a 390 px window", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/app/");
    await page
      .locator("input.address-url")
      .fill(`${ECHO}/content/xml?a-rather-long-query=with-a-long-value-that-has-to-be-cut-somewhere-in-the-row`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200");
    await page.getByRole("button", { name: "Request history", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Request history" });
    const chevron = drawer.locator("app-past-requests .section-chevron").last();
    await expect(chevron).toBeVisible();
    await expect
      .poll(async () => chevron.evaluate((icon) => icon.getBoundingClientRect().right))
      .toBeLessThanOrEqual(390);
  });

  // The 352 px sidebar was pinned from 768 px up. At 820 px that left the
  // composer and the response 150 px each: a header's name field was 20 px
  // wide and the response wrapped at every character. At 1024 px it left the
  // composer 294 px: its fourth tab was cut off and a header's fields showed
  // "Content-" and "applicatio".
  for (const width of [768, 820, 1024, 1199]) {
    test(`at ${width} px the sidebar is a drawer, so the composer and the response have room`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");

      await expect(page.getByRole("complementary", { name: "Collections sidebar" })).toHaveCount(0);
      await page.getByRole("tab", { name: "Headers", exact: true }).click();
      const field = await page.getByLabel("Headers name, row 1").boundingBox();
      // 85 px at 768 px; it was 20 px.
      expect(field!.width).toBeGreaterThanOrEqual(80);

      await page.getByRole("button", { name: "Toggle sidebar" }).click();
      const drawer = page.getByRole("dialog", { name: "Navigation" });
      await expect(drawer.getByRole("button", { name: "New collection" }).first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
    });
  }

  // Not at 1200 px exactly: WebKit takes its scrollbar off the width a media query sees.
  test("at 1220 px the sidebar is pinned beside the composer, and the composer still has room", async ({ page }) => {
    await page.setViewportSize({ width: 1220, height: 900 });
    await page.goto("/app/");
    await expect(page.getByRole("complementary", { name: "Collections sidebar" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);

    await page.getByRole("tab", { name: "Headers", exact: true }).click();
    const field = await page.getByLabel("Headers name, row 1").boundingBox();
    // 111 px at 1220 px: "Content-Type" in full. Pinned at 1024 px it was 85 px.
    expect(field!.width).toBeGreaterThanOrEqual(100);
    // Every composer tab is on screen, none cut off by the pane's edge.
    const pane = await page.locator(".ui-splitter-pane").first().boundingBox();
    const last = await page.getByRole("tab", { name: "Scripts", exact: true }).first().boundingBox();
    expect(last!.x + last!.width).toBeLessThanOrEqual(pane!.x + pane!.width + 1);
  });

  // S4 of PLAN-design 1.9: the toolbar holds the environment, Environments, History and Settings; from
  // 768 px the bridge, the vault, the secrets and the theme are in the status bar, each with its state
  // in words. On a phone the lock stays in the toolbar and the rest is in Settings.
  for (const width of [390, 767]) {
    test(`at ${width} px there is no status bar, and the toolbar keeps the lock and Settings in the window`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");
      await expect(page.locator("input.address-url")).toBeVisible();
      await expect(page.getByRole("contentinfo", { name: "Status" })).toHaveCount(0);
      await expect(page.getByRole("banner").getByRole("button", { name: "Unlock secrets", exact: true })).toBeVisible();
      for (const name of [/^Secrets$/, /^Route: /, /^Theme: /]) {
        await expect(page.getByRole("button", { name })).toHaveCount(0);
      }
      const settings = await page
        .getByRole("banner")
        .getByRole("button", { name: "Settings", exact: true })
        .boundingBox();
      expect(settings!.x + settings!.width).toBeLessThanOrEqual(width);
    });
  }

  // From 768 + 20 px: WebKit takes its scrollbar off the width a media query sees.
  for (const width of [788, 1100, 1440]) {
    test(`at ${width} px the status bar holds the bridge, the vault, the secrets and the theme, and says each state`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");
      const status = page.getByRole("contentinfo", { name: "Status" });
      await expect(status).toBeVisible();
      await expect(status).toContainText("Route: direct");
      await expect(status).toContainText("Vault locked");
      await expect(status).toContainText(/Saved in this browser|Kept in this browser/);
      // Each is one button, named by its words (U-072).
      for (const name of [/^Secrets$/, /^Route: direct$/, /^Theme: system$/, /^Vault locked$/]) {
        await expect(status.getByRole("button", { name })).toBeVisible();
        await expect(page.getByRole("banner").getByRole("button", { name })).toHaveCount(0);
      }
      const box = await status.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(900);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    });
  }

  test("opening the environment JSON editor does not make the page wider than the window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await openEnvironments(page);
    await page.getByRole("button", { name: "New environment" }).first().click();
    await page.getByPlaceholder("Environment name").fill("Wide");
    await page.getByRole("button", { name: "Create environment" }).click();
    await page.getByRole("tab", { name: "JSON", exact: true }).click();
    await expect(page.getByText("Loading editor…")).toHaveCount(0);
    await page.waitForTimeout(1000);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  // U-064 (WCAG 2.5.7): the split moves with one pointer and no drag.
  test("a click on either side of the split's line moves it, and a double click puts it back", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    const gutter = page.locator(".composer-response-splitter").getByRole("separator");
    const at = async () => Number(await gutter.getAttribute("aria-valuenow"));
    const start = await at();
    const box = (await gutter.boundingBox())!;
    await gutter.click({ position: { x: 1, y: box.height / 2 } });
    await expect.poll(at).toBe(start - 10);
    await gutter.click({ position: { x: box.width - 1, y: box.height / 2 } });
    await expect.poll(at).toBe(start);
    await gutter.click({ position: { x: box.width - 1, y: box.height / 2 } });
    await expect.poll(at).toBe(start + 10);
    await gutter.dblclick({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect.poll(at).toBe(45);
  });

  // U-003: from 1,440 px the response has the larger part of the split; below, the composer keeps it.
  for (const [width, wider] of [
    [1460, "response"],
    [1300, "composer"],
  ] as const) {
    test(`at ${width} px the ${wider} has the larger part of the split`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");
      const composer = (await page.locator(".composer-pane").boundingBox())!.width;
      const response = (await page.locator(".composer-response-splitter .ui-splitter-pane").nth(1).boundingBox())!
        .width;
      expect(wider === "response" ? response > composer : composer > response).toBe(true);
    });
  }

  test("the split cannot be dragged past its minimum pane sizes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    const splitter = page.locator(".composer-response-splitter");
    const gutter = splitter.getByRole("separator");
    const composer = page.locator(".composer-pane");
    const response = page.locator(".response-pane");
    const total = (await splitter.boundingBox())!.width;

    const dragTo = async (x: number) => {
      const box = (await gutter.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(x, box.y + box.height / 2, { steps: 40 });
      await page.mouse.up();
    };

    await dragTo(0);
    expect((await composer.boundingBox())!.width).toBeGreaterThanOrEqual(total * 0.28 - 1);
    await dragTo(1439);
    expect((await response.boundingBox())!.width).toBeGreaterThanOrEqual(total * 0.22 - 1);
  });
});

test.describe("Mobile composer (390px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("@claim:C-032 shows one composer section at a time via a single-open accordion, with real labels", async ({
    page,
  }) => {
    await page.goto("/app/");

    // Params is open by default; the others are present as labeled,
    // collapsed headers — not stacked-and-unlabeled content (Part D bug).
    await expect(page.getByRole("button", { name: "Params", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Headers", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Auth", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Scripts", exact: true })).toBeVisible();

    // Opening Auth must collapse Headers — only one panel open at a time.
    await page.getByRole("button", { name: "Headers", exact: true }).click();
    await expect(page.getByLabel("Headers name, row 1")).toBeVisible();
    await page.getByRole("button", { name: "Auth", exact: true }).click();
    await expect(page.getByLabel("Headers name, row 1")).toBeHidden();
    await expect(page.locator("#auth-type-select")).toBeVisible();
  });

  test("@claim:C-040 Monaco initializes in the Scripts panel instead of getting stuck on the loading placeholder", async ({
    page,
  }) => {
    await page.goto("/app/");
    await page.getByRole("button", { name: "Scripts", exact: true }).click();

    // Neither script editor should be permanently stuck on the placeholder.
    await expect(page.getByText("Loading editor…")).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 5_000 });
  });
});

// F55: the composer went back to Headers whenever the window crossed the
// 768 px line and came back, because the tab was mapped onto the phone's
// sections as "Body, or else Headers". A full-page screenshot in Chromium
// crosses that line for an instant (the window is 1 px wide), which is how
// it was first seen.
test("the composer keeps its open tab when the window is made narrow and wide again", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const tab = (name: string) => page.locator(".composer-pane").getByRole("tab", { name, exact: true });
  for (const name of ["Scripts", "Auth", "Params"]) {
    await tab(name).click();
    await expect(tab(name)).toHaveAttribute("aria-selected", "true");

    await page.setViewportSize({ width: 390, height: 844 });
    // On a phone the same part of the request is the open section.
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "true");

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(tab(name)).toHaveAttribute("aria-selected", "true");
  }
});

test.describe("Disabled 'Copy as cURL' affordance", () => {
  test("is visibly disabled (not an empty box) and explains why via a tooltip", async ({ page }) => {
    await page.goto("/app/");

    const curlButton = page.getByRole("button", { name: "Copy as cURL" });
    const curlWrap = page.locator(".curl-btn-wrap");
    await expect(curlButton).toBeDisabled();
    await expect(curlWrap).toHaveCSS("cursor", "not-allowed");
    const opacity = await curlButton.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeLessThan(1);

    await curlWrap.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Type an address to copy the request.");

    // Once a URL is entered, it becomes enabled with the plain "Copy as cURL" tooltip.
    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await expect(curlButton).toBeEnabled();
  });
});

test.describe("Render stability under rapid tab/viewport transitions", () => {
  test("rapid response-tab switching and viewport resizing never leaves a JSON editor stuck loading", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      // The HTML spec reports this as an error event when a ResizeObserver
      // callback resizes an observed element; WebKit surfaces it to
      // Playwright, Chromium and Firefox don't. It is not an app error.
      if (!/^ResizeObserver loop/.test(err.message)) pageErrors.push(String(err));
    });

    await page.goto("/app/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    const responseViewer = page.locator("app-response-viewer");
    const tabs = ["Headers", "Timings", "Tests", "Body"];
    for (let i = 0; i < 4; i++) {
      for (const tab of tabs) {
        await responseViewer.getByRole("tab", { name: tab }).click({ force: true });
      }
    }

    const widths = [390, 1440, 500, 1200, 767, 769, 320, 1600];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
    }
    await page.setViewportSize({ width: 390, height: 900 });

    await expect(page.getByText("Loading editor…")).toHaveCount(0, { timeout: 5_000 });
    expect(pageErrors).toEqual([]);
  });
});

// F46: an overlay's backdrop must be gone once the overlay has closed. With
// the previous drawer library the backdrop stayed in the page and swallowed every later click.
test.describe("The app stays usable after an overlay closes", () => {
  test("after the history drawer closes, the toolbar can be clicked", async ({ page }) => {
    await page.goto("/app/");
    await page.getByRole("button", { name: "Request history" }).click();
    await page.getByRole("button", { name: "Close history" }).click();

    await page.getByRole("banner").getByRole("button", { name: "Settings", exact: true }).click({ timeout: 5_000 });
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  });

  test("after a dialog closes with Escape, the composer can be clicked", async ({ page }) => {
    await page.goto("/app/");
    await page.getByRole("banner").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();

    await page.getByRole("button", { name: "Request history" }).click({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Close history" })).toBeVisible();
  });

  test("on a phone, after the navigation drawer closes, the composer can be clicked", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/");
    await page.getByRole("button", { name: "Toggle sidebar" }).first().click();
    await page.getByRole("button", { name: "Close navigation" }).click();

    await page.getByRole("button", { name: "Scripts", exact: true }).click({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Add test" })).toBeVisible();
  });
});

// S3b of PLAN-design 1.9: beside the request the response's JSON takes the pane's height, not a fixed 300 px.
test.describe("the response's height", () => {
  // A routed host must not be answered by the app's service worker first.
  test.use({ serviceWorkers: "block" });

  test("a JSON response fills the height of its pane, and grows with the window", async ({ page }) => {
    const items = Array.from({ length: 60 }, (_, id) => ({ id, name: `item ${id}` }));
    await page.route("https://fills.test/**", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        body: JSON.stringify({ items }),
      }),
    );
    const editor = page.locator("app-response-viewer app-json-editor");
    const height = async () => (await editor.boundingBox())?.height ?? 0;
    // 1000 px: at 900 the status bar and the response's own controls (audit U-030) leave the editor its 300 px minimum.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/app/");
    await page.locator("input.address-url").fill("https://fills.test/items");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200");
    await expect.poll(height).toBeGreaterThan(300);
    const short = await height();
    await page.setViewportSize({ width: 1440, height: 1400 });
    await expect.poll(height).toBeGreaterThan(short + 300);
    // The pane holds it: the editor ends inside the response pane.
    const pane = await page.locator(".response-pane").boundingBox();
    const box = await editor.boundingBox();
    expect(box && pane && box.y + box.height <= pane.y + pane.height).toBe(true);
  });

  // U-030 of docs/design/audit.md: the status, the tabs and the body's tools took 310 px before the body.
  test("the body starts within 240 px of the response's top: one status line, one row of tools", async ({ page }) => {
    await page.route("https://fills.test/**", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        body: JSON.stringify({ items: [1, 2, 3] }),
      }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await page.locator("input.address-url").fill("https://fills.test/items");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200");
    const viewer = page.locator("app-response-viewer");
    const editor = viewer.locator("app-json-editor");
    await expect(editor).toBeVisible();
    const top = (await viewer.boundingBox())?.y ?? 0;
    expect(((await editor.boundingBox())?.y ?? 0) - top).toBeLessThanOrEqual(240);
    // The status line is one line: the status and every fact share a row.
    const status = await viewer.locator(".response-status").boundingBox();
    expect(status?.height ?? 0).toBeLessThanOrEqual(56);
  });
});

// D3.3m: the toolbar is a <header>, no longer Material's toolbar; what Material gave it is the stylesheet's.
test.describe("the toolbar", () => {
  for (const width of [390, 1440]) {
    test(`at ${width} px it is the page's banner, 56 px tall, and stays at the top of the page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/app/");
      const banner = page.getByRole("banner");
      await expect(banner).toHaveCount(1);
      await expect(banner).toHaveJSProperty("tagName", "HEADER");
      const box = await banner.evaluate((el) => {
        const style = getComputedStyle(el);
        return { height: el.getBoundingClientRect().height, position: style.position, top: style.top };
      });
      expect(box).toEqual({ height: 56, position: "sticky", top: "0px" });
      // Its row does not wrap: each control sits on the centre line of the 55 px above its border.
      for (const control of await banner.getByRole("button").all()) {
        if (!(await control.isVisible())) continue;
        const rect = await control.boundingBox();
        expect(rect && rect.y + rect.height / 2).toBe(27.5);
      }
    });
  }

  test("in forced colours it keeps an edge", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/app/");
    const outline = await page
      .getByRole("banner")
      .evaluate((el) => `${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).outlineWidth}`);
    expect(outline).toBe("solid 1px");
  });
});
