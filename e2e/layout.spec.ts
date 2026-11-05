import { test, expect, type Page } from "@playwright/test";
import { openEnvironments, openPalette, openSettings, toolbarOrDrawer } from "./support/app";
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
    await page
      .getByRole("tab", { name: /^Scripts( |$)/ })
      .first()
      .click();
    await expect(page.getByText("Loading editor…")).toHaveCount(0);
    // The editor sizes itself to its container: a container that sizes itself to the editor grows without end.
    await page.waitForTimeout(1000);
    const splitter = page.locator(".composer-response-splitter");
    expect((await splitter.boundingBox())!.width).toBeLessThanOrEqual(1440);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  // The composer ran 49 px past the window (no box-sizing reset), and below
  // 1024 px the toolbar was wider than the space beside the pinned sidebar.
  for (const width of [1440, 1220, 1200, 1100, 1024, 900, 820, 768, 767, 640, 420, 390, 360, 320]) {
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
      await page.locator("#new-env-name-input").press("Enter");
      await page.getByRole("button", { name: "Export environments" }).click();
      const dialog = page.getByRole("dialog", { name: "Export environments" });
      const choices = dialog.getByRole("radiogroup", { name: "Secret variables" });
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
    await page.locator("#new-env-name-input").press("Enter");
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
  test("a long URL in a phone's history row is cut short, and the row's Delete stays inside a 390 px window", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/app/");
    await page
      .locator("input.address-url")
      .fill(`${ECHO}/content/xml?a-rather-long-query=with-a-long-value-that-has-to-be-cut-somewhere-in-the-row`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200");
    await toolbarOrDrawer(page, "History");
    const drawer = page.getByRole("dialog", { name: "History", exact: true });
    const remove = drawer.getByRole("button", { name: "Delete from history" }).last();
    await expect(remove).toBeVisible();
    await expect
      .poll(async () => remove.evaluate((button) => button.getBoundingClientRect().right))
      .toBeLessThanOrEqual(390);
    // The address is cut with an ellipsis inside its row, not pushed past the window.
    const address = drawer.locator(".history-address").last();
    expect(await address.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
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
      await page.getByRole("tab", { name: /^Headers( |$)/ }).click();
      const field = await page.getByLabel(/^Header name, 1 of /).boundingBox();
      // 85 px at 768 px; it was 20 px.
      expect(field!.width).toBeGreaterThanOrEqual(80);

      await page.getByRole("button", { name: /^(Show|Hide) sidebar$/ }).click();
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

    await page.getByRole("tab", { name: /^Headers( |$)/ }).click();
    const field = await page.getByLabel(/^Header name, 1 of /).boundingBox();
    // 111 px at 1220 px: "Content-Type" in full. Pinned at 1024 px it was 85 px.
    expect(field!.width).toBeGreaterThanOrEqual(100);
    // Every composer tab is on screen, none cut off by the pane's edge.
    const pane = await page.locator(".ui-splitter-pane").first().boundingBox();
    const last = await page
      .getByRole("tab", { name: /^Scripts( |$)/ })
      .first()
      .boundingBox();
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
      await expect(page.getByRole("banner").getByRole("button", { name: "Unlock vault", exact: true })).toBeVisible();
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
      await expect(status).toContainText("No vault");
      await expect(status).toContainText(/Saved in this browser|Kept in this browser|Kept by Safari/);
      // Each is one button, named by its words (U-072).
      for (const name of [/^Secrets$/, /^Route: direct$/, /^Theme: system$/, /^No vault$/]) {
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
    await page.locator("#new-env-name-input").fill("Wide");
    await page.locator("#new-env-name-input").press("Enter");
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

  // U-003: from 1,440 px the response has the larger part of the split; below, the composer keeps it. 1,100 px and
  // not 1,300: beside the pinned sidebar a 1,300 px window puts the response under the request (L-6, L-7).
  for (const [width, wider] of [
    [1460, "response"],
    [1100, "composer"],
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

// L-6, L-7: below 62 em of work area (not of window) the two panes were columns of 300 to 420 px; the status line
// wrapped to three lines and the JSON scrolled sideways. The response goes under the request there.
test.describe("the response under the request", () => {
  const gutter = (page: Page) => page.locator(".composer-response-splitter").getByRole("separator");

  for (const [width, orientation] of [
    [820, "horizontal"],
    [1024, "horizontal"],
    [1100, "vertical"],
    [1220, "horizontal"],
    [1460, "vertical"],
  ] as const) {
    test(`at ${width} px the line between the request and the response is ${orientation}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");
      await expect(gutter(page)).toHaveAttribute("aria-orientation", orientation);
    });
  }

  // V22 of the final design pass: the line stopped 16 px above the status bar, in the panel's padding.
  for (const [width, orientation] of [
    [1460, "vertical"],
    [820, "horizontal"],
  ] as const) {
    test(`at ${width} px the split runs down to the status bar (${orientation} line)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");
      await expect(gutter(page)).toHaveAttribute("aria-orientation", orientation);
      const split = (await page.locator(".composer-response-splitter").boundingBox())!;
      const status = (await page.locator(".status-bar").boundingBox())!;
      expect(Math.abs(split.y + split.height - status.y)).toBeLessThan(1);
    });
  }

  test("at 820 px the response is under the request, as wide as it, and its status line is one line", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto("/app/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    const composer = (await page.locator(".composer-pane").boundingBox())!;
    const response = (await page.locator(".response-pane").boundingBox())!;
    expect(response.y).toBeGreaterThanOrEqual(composer.y + composer.height);
    expect(Math.abs(response.width - composer.width)).toBeLessThan(2);
    // The request takes at most two fifths of the split until it is moved.
    expect(response.height).toBeGreaterThan(composer.height);
    const status = await page.locator("app-response-viewer .response-status").boundingBox();
    expect(status?.height ?? 0).toBeLessThanOrEqual(56);
  });

  test("@claim:C-031 each orientation keeps its own split across a reload", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto("/app/");
    const composer = page.locator(".composer-pane");
    const box = (await gutter(page).boundingBox())!;
    const before = (await composer.boundingBox())!.height;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 120, { steps: 10 });
    await page.mouse.up();
    const after = (await composer.boundingBox())!.height;
    expect(after).toBeGreaterThan(before + 80);
    expect(await page.evaluate(() => localStorage.getItem("wayfarer:composer-split-stacked"))).not.toBeNull();
    // The split beside the request is not the one that moved.
    expect(await page.evaluate(() => localStorage.getItem("wayfarer:composer-split"))).toBeNull();

    await page.reload();
    await expect.poll(async () => Math.abs((await composer.boundingBox())!.height - after)).toBeLessThan(2);
    // The default beside the request is read when the page loads (U-003), so load it at that width.
    await page.setViewportSize({ width: 1460, height: 900 });
    await page.reload();
    await expect(gutter(page)).toHaveAttribute("aria-orientation", "vertical");
    await expect(gutter(page)).toHaveAttribute("aria-valuenow", "45");
  });

  test("Settings › General chooses beside or under whatever the room, and the choice stays after a reload", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto("/app/");
    await expect(gutter(page)).toHaveAttribute("aria-orientation", "horizontal");
    const dialog = await openSettings(page, "General");
    await dialog.getByRole("radio", { name: "Beside the request" }).click();
    await expect(gutter(page)).toHaveAttribute("aria-orientation", "vertical");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(gutter(page)).toHaveAttribute("aria-orientation", "vertical");
    expect(await page.evaluate(() => localStorage.getItem("wayfarer:pane-layout"))).toBe("beside");

    await page.setViewportSize({ width: 1460, height: 900 });
    const again = await openSettings(page, "General");
    await again.getByRole("radio", { name: "Under the request" }).click();
    await expect(gutter(page)).toHaveAttribute("aria-orientation", "horizontal");
    await again.getByRole("radio", { name: "By the room it has" }).click();
    await expect(gutter(page)).toHaveAttribute("aria-orientation", "vertical");
  });

  test("the palette puts the response under the request, and beside it again", async ({ page }) => {
    await page.setViewportSize({ width: 1460, height: 900 });
    await page.goto("/app/");
    for (const [command, orientation] of [
      ["Put the response under the request", "horizontal"],
      ["Put the response beside the request", "vertical"],
    ] as const) {
      const field = await openPalette(page);
      await field.fill(command);
      await page.getByRole("listbox", { name: "Results" }).getByRole("option", { name: command }).click();
      await expect(gutter(page)).toHaveAttribute("aria-orientation", orientation);
    }
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
    await expect(page.getByRole("button", { name: /^Params( |$)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Headers( |$)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Auth( |$)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Scripts( |$)/ })).toBeVisible();

    // Opening Auth must collapse Headers — only one panel open at a time.
    await page.getByRole("button", { name: /^Headers( |$)/ }).click();
    await expect(page.getByLabel(/^Header name, 1 of /)).toBeVisible();
    await page.getByRole("button", { name: /^Auth( |$)/ }).click();
    await expect(page.getByLabel(/^Header name, 1 of /)).toBeHidden();
    await expect(page.locator("#auth-type-select")).toBeVisible();
  });

  test("@claim:C-040 Monaco initializes in the Scripts panel instead of getting stuck on the loading placeholder", async ({
    page,
  }) => {
    await page.goto("/app/");
    await page.getByRole("button", { name: /^Scripts( |$)/ }).click();

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
    await page.getByRole("button", { name: "History", exact: true }).click();
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

    await page.getByRole("button", { name: "History", exact: true }).click({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Close history" })).toBeVisible();
  });

  test("on a phone, after the navigation drawer closes, the composer can be clicked", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/");
    await page
      .getByRole("button", { name: /^(Show|Hide) sidebar$/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Close navigation" }).click();

    await page.getByRole("button", { name: /^Scripts( |$)/ }).click({ timeout: 5_000 });
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

  // U-174: the HTML preview was 300 px whatever room the pane had.
  test("an HTML preview fills the height of its pane, beside the request and under it, and keeps 300 px on a phone", async ({
    page,
  }) => {
    await page.route("https://fills.test/**", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/html", "access-control-allow-origin": "*" },
        body: "<!doctype html><h1>A page</h1>",
      }),
    );
    const preview = page.locator("app-response-viewer iframe.html-preview");
    const height = async () => (await preview.boundingBox())?.height ?? 0;
    const endsInPane = async () => {
      const pane = await page.locator(".response-pane").boundingBox();
      const box = await preview.boundingBox();
      // Its bottom is the pane's, less the body's padding: no empty pane under it.
      return box && pane ? pane.y + pane.height - (box.y + box.height) : -1;
    };
    // Beside the request (1,460 px is wide enough for the panes side by side).
    await page.setViewportSize({ width: 1460, height: 1000 });
    await page.goto("/app/");
    await page.locator("input.address-url").fill("https://fills.test/page");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200");
    await expect.poll(height).toBeGreaterThan(500);
    expect(await endsInPane()).toBeGreaterThanOrEqual(0);
    expect(await endsInPane()).toBeLessThanOrEqual(32);
    // Under the request, as Playwright's 1,280 by 720 puts it: the pane is short, and the preview keeps 300 px.
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(height).toBeGreaterThanOrEqual(300);
    // On a phone the sections stack and the page scrolls: 300 px.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Response", exact: true }).click();
    await expect.poll(height).toBe(300);
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

// U-073 (D3.6): text is in rem, so at 200% text the type grows with the boxes. At 1,440 px every response tab's
// label is whole; before, the sidebar took half the window and the response's tabs read "Timi…".
test("at 200% text and 1440 px no response tab's label is cut", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  // The root's font size at 200%, as text-only zoom sets it. The browser's default text size, which a media query
  // reads, is text-size.spec.ts's (U-153).
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  const tabs = page.locator("app-response-viewer").getByRole("tab");
  expect(await tabs.count()).toBeGreaterThan(2);
  const cut = await tabs.evaluateAll((all) =>
    all
      .filter((tab) => [tab, ...tab.querySelectorAll("*")].some((el) => el.scrollWidth > el.clientWidth + 1))
      .map((tab) => tab.textContent?.trim()),
  );
  expect(cut).toEqual([]);
  // The type did grow: a tab's label is 26 px (13 at 200%), not the 12 or 13 it was when type was in px.
  const size = await tabs.first().evaluate((tab) => parseFloat(getComputedStyle(tab).fontSize));
  expect(size).toBeGreaterThanOrEqual(24);
});

// U-155: at 200% text the composer beside the tree is narrow while the window is wide. Params was a grid by the
// window's width and left its key and value 20 px each; a row wraps by its own room, as the other row editors do.
test("at 200% text and 1440 px a parameter's name and value have room to type in", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await page.locator("input.address-url").fill(`${ECHO}/echo?kind=pets`);
  for (const name of ["Parameter name, 1 of 1", "Value of kind"]) {
    const box = await page.getByLabel(name, { exact: true }).boundingBox();
    expect(box?.width, name).toBeGreaterThanOrEqual(160);
  }
});

// U-070: below 1,200 px the sidebar was a closed drawer over the page. From 1,024 px it can stay beside the page,
// narrower, and the choice is kept; below 1,024 px it is a drawer, as before.
test("from 1,024 px the sidebar can stay beside the page, and stays after a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/app/");
  await expect(page.getByRole("complementary", { name: "Collections sidebar" })).toHaveCount(0);
  await page.getByRole("button", { name: /^(Show|Hide) sidebar$/ }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await drawer.getByRole("button", { name: "Keep beside the page" }).click();
  const aside = page.getByRole("complementary", { name: "Collections sidebar" });
  await expect(aside).toBeVisible();
  expect((await aside.boundingBox())!.width).toBeLessThanOrEqual(281);
  // The composer is not under it.
  const composer = await page.locator(".composer-pane").boundingBox();
  expect(composer!.x).toBeGreaterThanOrEqual(280);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1100);
  await page.reload();
  await expect(aside).toBeVisible();
  await aside.getByRole("button", { name: "Show as a drawer" }).click();
  await expect(aside).toHaveCount(0);
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(page.getByRole("button", { name: "Keep beside the page" })).toHaveCount(0);
});

// U-097: a phone's toolbar was six controls, five of them icons. Environments and History are rows of the drawer.
test("on a phone Environments and History are named rows of the drawer, not toolbar icons", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/");
  const toolbar = page.getByRole("banner");
  await expect(toolbar.getByRole("button", { name: "Environments" })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "History", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^(Show|Hide) sidebar$/ }).click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "History", exact: true })).toBeVisible();
});
