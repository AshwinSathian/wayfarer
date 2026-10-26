import { expect, test } from "@playwright/test";
import { ECHO } from "./support/echo";

// F71 (#242). Monaco's language services load when a model of their language
// first needs them, and with them comes every editor contribution Monaco has
// (its worker manager imports them all). One of those, code lens, asks for a
// service that it registers as it is loaded; a service registered after the
// first editor exists is never added, so the contribution threw
// "depends on UNKNOWN service ICodeLensCache" when Monaco got round to it:
// on a timer, some seconds after an editor mounted. The loader now registers
// the feature before the first editor.
test("F71: nothing of Monaco's throws once its language services have loaded and its timers have run", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/app/");

  // A script editor: the TypeScript service starts.
  await page.getByRole("tab", { name: "Scripts", exact: true }).first().click();
  const script = page.locator("app-script-editor .monaco-editor").first();
  await expect(script).toBeVisible({ timeout: 10_000 });
  await script.click();
  await page.keyboard.type("const a = 1;");
  // Monaco puts some contributions off for five seconds after an editor mounts. The wait is real:
  // under Playwright's clock Monaco's own use of `performance.measure` throws, which is not what is tested.
  await page.waitForTimeout(6_000);

  expect(errors).toEqual([]);
});

// U-052, U-038 (D4-e): an editor is set in the app's monospace, its brackets in the text's own colour, and it draws
// no focus line of its own: its host draws the app's ring.
test("the response's editor is in the app's monospace, with plain brackets and no blue focus line", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?u052=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  const editor = page.locator("app-response-viewer .monaco-editor").first();
  await expect(editor).toBeVisible();
  const mono = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-mono"));
  const first = (list: string) => list.split(",")[0].trim().replace(/["']/g, "");
  const line = editor.locator(".view-lines .view-line").first();
  await expect(line).toContainText("{");
  // Read in one go: Monaco draws its lines again, and a line read a moment later may be one it has let go.
  await expect
    .poll(() => editor.evaluate((root) => getComputedStyle(root.querySelector(".view-lines .view-line")!).fontFamily))
    .toContain(first(mono));
  // The opening brace is drawn in the text's own colour, not a depth's.
  const [brace, text] = await editor.evaluate((root) => {
    const span = [...root.querySelectorAll(".view-lines span span")].find((el) => el.textContent === "{")!;
    return [getComputedStyle(span).color, getComputedStyle(root.querySelector(".view-lines")!).color];
  });
  expect(brace).toBe(text);
  await editor.click();
  // Monaco's default focusBorder: a 1 px line in rgb(0, 144, 241) on what has focus.
  const blue = await editor.evaluate(
    (root) =>
      [root, ...root.querySelectorAll("*")].filter((el) => {
        const style = getComputedStyle(el);
        return (
          (style.outlineStyle !== "none" && style.outlineColor === "rgb(0, 144, 241)") ||
          style.borderTopColor === "rgb(0, 144, 241)"
        );
      }).length,
  );
  expect(blue).toBe(0);
});
