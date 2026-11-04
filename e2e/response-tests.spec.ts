import { expect, test } from "@playwright/test";
import { OPEN } from "./design/open";

test.use({ serviceWorkers: "block" });

// U-190: with every test passing, the Tests tab said "0 failed" in the error colour, with the error glyph.
test("with every test passing, the Tests tab's failed count is not drawn as an error", async ({ page }) => {
  await OPEN["response-tests"](page);
  const failed = page.locator("app-response-viewer").getByText(/^\s*0 failed\s*$/);
  await expect(failed).toBeVisible();
  await expect(failed).not.toHaveClass(/text-status-error/);
});
