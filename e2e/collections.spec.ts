import { test, expect } from "@playwright/test";

test.describe("Collections", () => {
  test("creates a collection, creates a request inside it, and loads it into the composer", async ({ page }) => {
    await page.goto("/");

    // Create a collection via the sidebar header's "+" button.
    const newCollectionButton = page.getByRole("button", { name: "New collection" });
    await newCollectionButton.click();

    const nameInput = page.locator("#creation-name-input");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("E2E Test Collection");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    const collectionNode = page.getByText("E2E Test Collection", { exact: true });
    await expect(collectionNode).toBeVisible();

    // Selecting the node, then pressing "n" (the app's own shortcut) opens
    // the "new request" creation dialog — there's no dedicated toolbar
    // button for it today; this and the right-click context menu are the
    // only paths.
    await collectionNode.click();
    await page.waitForTimeout(100);
    await page.keyboard.press("n");

    await expect(nameInput).toBeVisible();
    await nameInput.fill("E2E Test Request");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    const requestNode = page.getByText("E2E Test Request", { exact: true });
    await expect(requestNode).toBeVisible();

    // Loading it into the composer should populate the method selector and
    // clear any leftover URL from a prior composer session.
    await requestNode.click();
    await expect(page.locator("input.address-url")).toHaveValue("");
  });
});
