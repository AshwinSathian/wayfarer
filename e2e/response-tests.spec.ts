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

// U-202: "Add one in the Scripts tab" named a tab; the line's button opens it, with focus on it.
test("a response with no tests offers Add a test, which opens the request's Scripts with focus on it", async ({
  page,
}) => {
  // A request typed here, sent: it has no tests.
  await OPEN["response-html"](page);
  const viewer = page.locator("app-response-viewer");
  await viewer.getByRole("tab", { name: /^Tests/ }).click();
  await expect(viewer.getByText("This request has no tests.")).toBeVisible();
  await viewer.getByRole("button", { name: "Add a test" }).click();
  const scripts = page.locator("app-composer").getByRole("tab", { name: /^Scripts( |$)/ });
  await expect(scripts).toBeFocused();
  await expect(scripts).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("app-tests-panel")).toBeVisible();
});
