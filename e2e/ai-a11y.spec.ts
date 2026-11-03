import { test, expect, type Locator, type Page } from "@playwright/test";
import { axe } from "./support/axe";
import { settled } from "./support/settled";
import { send, toolbarOrDrawer } from "./support/app";
import { ECHO } from "./support/echo";

// D4.10's shared AC: each AI view passes axe (WCAG 2.2 AA) and is no wider than the window, at four widths, in both
// themes, in three engines: the previews, a proposal, an answer, the Draft dialog and a model call in History.

const MODEL = "http://127.0.0.1:4300/model";

async function check(page: Page, view: Locator, width: number, what: string): Promise<void> {
  await expect(view).toBeVisible();
  await page.mouse.move(0, 0);
  await settled(page);
  const { violations } = await axe(page).include("body").analyze();
  expect(violations, `${what}: ${violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join("\n")}`).toEqual(
    [],
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth), what).toBeLessThanOrEqual(width);
  const box = await view.boundingBox();
  expect(box && box.x + box.width, what).toBeLessThanOrEqual(width + 0.5);
}

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 820, 1440])
    test(`the AI views pass axe and fit a ${width} px window, ${theme}`, async ({ page }, info) => {
      test.slow();
      const model = `a11y-model-${info.workerIndex}-${Date.now()}`;
      await page.addInitScript(
        ({ address, model, theme }) => {
          localStorage.setItem("wayfarer:theme", theme);
          localStorage.setItem(
            "wayfarer:ai",
            JSON.stringify({
              kind: "openai",
              address,
              model,
              route: "direct",
              actions: { tests: true, draft: true, explain: true },
            }),
          );
        },
        { address: `${MODEL}/v1`, model, theme },
      );
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");
      await page.locator("input.address-url").fill(`${ECHO}/status/422`);
      await send(page);
      await expect(page.locator(".status-badge")).toHaveText("422");

      // Write tests: the preview, then the proposal.
      await page
        .locator("app-response-viewer")
        .getByRole("tab", { name: /^Tests/ })
        .click();
      await page.getByRole("button", { name: "Write tests from this response…" }).click();
      const tests = page.getByRole("region", { name: "Ask the model to write tests" });
      await check(page, tests, width, "Write tests' preview");
      await tests.getByRole("button", { name: "Send to model" }).click();
      await check(page, page.getByRole("region", { name: "Proposed tests" }), width, "proposed tests");

      // Explain: the answer under the call's record.
      await page.locator(".record-toggle").click();
      await page.getByRole("button", { name: "Explain this response…" }).click();
      await page
        .getByRole("region", { name: "Ask the model to explain this response" })
        .getByRole("button", { name: "Send to model" })
        .click();
      await check(page, page.getByRole("region", { name: "The model answered" }), width, "the explanation");

      // Draft: the dialog's first step, its preview, the proposal.
      // ⌘K: on a phone the toolbar has no search field.
      await page.locator("input.address-url").focus();
      await page.keyboard.press("ControlOrMeta+k");
      const field = page.getByRole("combobox", { name: /^Search requests/ });
      await expect(field).toBeFocused();
      await field.fill("Draft a request");
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Draft a request" });
      await dialog.getByLabel("Description").fill("List the pets");
      await check(page, dialog, width, "the Draft dialog");
      await dialog.getByRole("button", { name: "Preview…" }).click();
      await dialog.getByRole("button", { name: "Send to model" }).click();
      await check(page, dialog.getByRole("region", { name: "Proposed request" }), width, "the proposed request");
      await dialog.getByRole("button", { name: "Discard" }).click();
      await expect(dialog).toHaveCount(0);

      // History: the filter and a model call opened in place.
      await toolbarOrDrawer(page, "Request history");
      const drawer = page.getByRole("dialog", { name: "Request history" });
      await drawer.getByRole("radio", { name: "Model calls" }).click();
      const row = drawer.getByRole("button", { name: /^Model call, Explain a response/ });
      await row.focus();
      await page.keyboard.press("Enter");
      await drawer.getByRole("button", { name: "Show what was sent" }).focus();
      await page.keyboard.press("Enter");
      await check(page, drawer, width, "History with a model call open");
    });
