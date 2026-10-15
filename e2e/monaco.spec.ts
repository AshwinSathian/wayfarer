import { expect, test } from "@playwright/test";

// F71 (#242). Monaco's language services load when a model of their language
// first needs them, and with them comes every editor contribution Monaco has
// (its worker manager imports them all). One of those, code lens, asks for a
// service that it registers as it is loaded; a service registered after the
// first editor exists is never added, so the contribution threw
// "depends on UNKNOWN service ICodeLensCache" when Monaco got round to it:
// on a timer, some seconds after an editor mounted. The loader now registers
// the feature before the first editor.
test("F71: nothing of Monaco's throws once its language services have loaded and its timers have run", async ({ page }) => {
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
