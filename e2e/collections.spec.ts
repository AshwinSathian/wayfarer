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

  test("saves the composer's current request into a collection, then reloads it with everything intact", async ({ page }) => {
    await page.goto("/");

    const urlInput = page.locator("input.address-url");
    const nameInput = page.locator("#creation-name-input");

    await page.getByRole("button", { name: "New collection" }).click();
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Save Flow Collection");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("Save Flow Collection", { exact: true })).toBeVisible();

    // Compose a request from scratch — nothing selected/bound yet, so Save
    // must open "Save to Collection" rather than silently failing.
    await urlInput.fill("https://jsonplaceholder.typicode.com/todos/7");
    await page.getByRole("button", { name: "Save to Collection" }).click();

    const saveDialog = page.locator(".p-dialog:visible").last();
    await expect(saveDialog).toBeVisible();
    await saveDialog.locator("#save-as-name").fill("My Saved Request");
    await saveDialog.getByRole("button", { name: "Save", exact: true }).click();

    // The composer now shows it's bound to the request that was just
    // created. Scoped to <main> since the sidebar tree also renders a node
    // with the same name.
    await expect(page.getByRole("main").getByText("My Saved Request", { exact: true })).toBeVisible();
    await expect(page.getByText(/Save writes back to this request/)).toBeVisible();

    // Starting a new request and reloading the saved one round-trips the
    // full URL back in — previously this path lost everything but
    // method/url/headers/body (auth, scripts, tests silently dropped) since
    // the tree only ever emitted a lossy PastRequest-shaped object.
    await page.getByRole("button", { name: "New request", exact: true }).click();
    await expect(urlInput).toHaveValue("");
    await page.getByText("My Saved Request", { exact: true }).dblclick();
    await expect(urlInput).toHaveValue("https://jsonplaceholder.typicode.com/todos/7");

    // Editing and hitting the now-"Save" (in-place) button persists the
    // change back onto the same request rather than creating a duplicate.
    await urlInput.fill("https://jsonplaceholder.typicode.com/todos/8");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "New request", exact: true }).click();
    await page.getByText("My Saved Request", { exact: true }).dblclick();
    await expect(urlInput).toHaveValue("https://jsonplaceholder.typicode.com/todos/8");
  });
});
