import { test, expect } from "@playwright/test";
import { ECHO } from "./support/echo";
import { dumpIdb, seedAndOpen } from "./support/app";

test.describe("Collections", () => {
  test("@claim:C-024 creates a collection, creates a request inside it, and loads it into the composer", async ({
    page,
  }) => {
    await page.goto("/app/");

    // Create a collection via the sidebar header's "+" button.
    const newCollectionButton = page.getByRole("button", { name: "New collection" }).first();
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

  test("saves the composer's current request into a collection, then saves it again in place", async ({ page }) => {
    await page.goto("/app/");

    const urlInput = page.locator("input.address-url");
    const nameInput = page.locator("#creation-name-input");

    await page.getByRole("button", { name: "New collection" }).first().click();
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Save Flow Collection");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("Save Flow Collection", { exact: true })).toBeVisible();

    // Compose a request from scratch — nothing selected/bound yet, so Save
    // must open "Save to collection" rather than silently failing.
    await urlInput.fill(`${ECHO}/content/json?todo=7`);
    await page.getByRole("button", { name: "Save to collection" }).click();

    const saveDialog = page.getByRole("dialog", { name: "Save to collection" });
    await expect(saveDialog).toBeVisible();
    await saveDialog.locator("#save-as-name").fill("My Saved Request");
    await saveDialog.getByRole("button", { name: "Save", exact: true }).click();

    // The composer now shows it's bound to the request that was just
    // created: its editing line names it (the tree and the tab do too).
    await expect(
      page.getByRole("navigation", { name: "Saved request" }).getByText("My Saved Request", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Save writes back to it/)).toBeVisible();

    // Editing and hitting the now-"Save" (in-place) button writes the
    // change onto the same stored request rather than creating a duplicate.
    await urlInput.fill(`${ECHO}/content/json?todo=8`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const storedUrls = async () => ((await dumpIdb(page))["requests"] as { url: string }[]).map((r) => r.url);
    await expect.poll(storedUrls).toEqual([`${ECHO}/content/json?todo=8`]);
    await expect(page.getByRole("tree").getByText("My Saved Request", { exact: true })).toHaveCount(1);

    // A new tab, then the tree opens the request again (the tab it is open in, which holds what was saved).
    await page.getByRole("button", { name: "New tab", exact: true }).click();
    await expect(urlInput).toHaveValue("");
    await page.getByRole("tree").getByText("My Saved Request", { exact: true }).click();
    await expect(urlInput).toHaveValue(`${ECHO}/content/json?todo=8`);
  });

  // U-008 and U-009 of docs/design/audit.md: every rival opens a request on
  // one click and names its method in the tree.
  test("a click or Enter on a request opens it, and the tree shows its method", async ({ page }) => {
    await page.goto("/app/");
    const urlInput = page.locator("input.address-url");
    const nameInput = page.locator("#creation-name-input");

    await page.getByRole("button", { name: "New collection" }).first().click();
    await nameInput.fill("One Click");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    // Until the dialog has closed, the page under it is inert: a field there takes no text.
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByLabel("HTTP method").fill("POST");
    await urlInput.fill(`${ECHO}/echo?one=click`);
    await page.getByRole("button", { name: "Save to collection" }).click();
    const saveDialog = page.getByRole("dialog", { name: "Save to collection" });
    await saveDialog.locator("#save-as-name").fill("Clicked");
    await saveDialog.getByRole("button", { name: "Save", exact: true }).click();

    const row = page.getByRole("treeitem", { name: "Clicked" });
    await expect(row).toContainText("POST");

    await page.getByRole("button", { name: "New tab", exact: true }).click();
    await expect(urlInput).toHaveValue("");
    await row.click();
    await expect(urlInput).toHaveValue(`${ECHO}/echo?one=click`);

    await page.getByRole("button", { name: "New tab", exact: true }).click();
    await expect(urlInput).toHaveValue("");
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(urlInput).toHaveValue(`${ECHO}/echo?one=click`);
    // From the keyboard the user goes on walking the tree.
    await expect(row).toBeFocused();
  });
});

// U-067: a save rebuilt the tree's rows, and the folder that held the request closed under it, the saved row gone
// from view and unselected.
test("Ctrl+S keeps the request's folder open and its row selected", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/content/json`, folder: {} });
  const tree = page.getByRole("tree");
  const folder = tree.getByRole("treeitem", { name: /Tripwire folder/ });
  const request = tree.getByRole("treeitem", { name: /Tripwire request/ });
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(request).toHaveAttribute("aria-selected", "true");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?saved=1`);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("img", { name: "Unsaved changes" })).toHaveCount(0);
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(request).toBeVisible();
  await expect(request).toHaveAttribute("aria-selected", "true");
});

// U-163, U-177: with no collection the first save said to make one in the sidebar and offered a disabled Save; with
// one, its Name opened empty and Save disabled, though the tab named the request. The first save is now one press.
test("the first save, with no collection yet, is one press: the tab's name, a collection made with it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?first=1`);
  await page.keyboard.press("ControlOrMeta+s");
  const save = page.getByRole("dialog", { name: "Save to collection" });
  const name = save.getByRole("textbox", { name: "Name" });
  await expect(name).toHaveValue("127.0.0.1:4300/content/json?first=1");
  await expect(name).toBeFocused();
  await expect(save.getByRole("textbox", { name: "New collection" })).toHaveValue("My collection");
  // Selected: what is typed replaces it.
  await page.keyboard.type("Typed name");
  await expect(name).toHaveValue("Typed name");
  await save.getByRole("button", { name: "Save", exact: true }).click();
  await expect(save).toHaveCount(0);
  const tree = page.getByRole("tree");
  await expect(tree.getByText("My collection", { exact: true })).toBeVisible();
  await expect(tree.getByText("Typed name", { exact: true })).toBeVisible();
  await expect(page.getByText(/Save writes back to it/)).toBeVisible();

  // With a collection, the name is the tab's and Save is enabled at once.
  await page.getByRole("button", { name: "New tab" }).click();
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(name).toHaveValue("127.0.0.1:4300/echo");
  await expect(save.getByRole("textbox", { name: "New collection" })).toHaveCount(0);
  await save.getByRole("button", { name: "Save", exact: true }).click();
  await expect(tree.getByText("127.0.0.1:4300/echo", { exact: true })).toBeVisible();
});

// U-094: a stray click on the backdrop closed Save to collection and Create vault passphrase, and what was typed went.
test("a click on the backdrop keeps Save to collection and the vault's dialog open, with what was typed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/content/json` });
  await page.getByRole("button", { name: "New tab" }).click();
  await page.locator("input.address-url").fill(`${ECHO}/content/json?new=1`);
  await page.keyboard.press("ControlOrMeta+s");
  const save = page.getByRole("dialog", { name: "Save to collection" });
  await expect(save).toBeVisible();
  const name = save.getByRole("textbox").first();
  await name.fill("Kept name");
  await page.mouse.click(5, 5);
  await expect(save).toBeVisible();
  await expect(name).toHaveValue("Kept name");
  await page.keyboard.press("Escape");
  await expect(save).toHaveCount(0);

  await page.getByRole("button", { name: "No vault", exact: true }).click();
  const vault = page.getByRole("dialog", { name: /Create vault passphrase|Unlock vault/ });
  await expect(vault).toBeVisible();
  await vault.locator("input").first().fill("typed");
  await page.mouse.click(5, 5);
  await expect(vault).toBeVisible();
  await expect(vault.locator("input").first()).toHaveValue("typed");
});

// U-080, U-056: a delete in the tree asked "Delete item?", named nothing and could not be undone. It goes at once,
// says what went, and Undo (or Ctrl+Z) puts it back as it was, its scripts' approval and its body's file included.
test("a deleted folder comes back with what was in it, by Undo or by Ctrl+Z", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/content/json`, folder: {} });
  const tree = page.getByRole("tree");
  await tree.getByText("Tripwire folder", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  const bar = page.locator(".undo-bar");
  await expect(bar).toContainText("Deleted Tripwire folder. The 1 request in it went with it.");
  await expect(tree.getByText("Tripwire folder", { exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Undo" }).click();
  await expect(tree.getByText("Tripwire folder", { exact: true })).toBeVisible();
  await expect(bar).not.toContainText("Deleted");

  // Again, and back by the key, from outside a field.
  await tree.getByText("Tripwire folder", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(tree.getByText("Tripwire folder", { exact: true })).toHaveCount(0);
  await tree.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(tree.getByText("Tripwire folder", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tree").getByText("Tripwire folder", { exact: true })).toBeVisible();
  await page.getByRole("tree").getByText("Tripwire folder", { exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tree").getByText("Tripwire request", { exact: true })).toBeVisible();
});

// U-139: a switched-off parameter is not in the address, and reading the address again dropped it: on opening the
// request, on an edit of the address, and so on a save.
test("a switched-off query parameter stays through opening, an edit of the address and a save", async ({ page }) => {
  await seedAndOpen(
    page,
    {},
    {
      method: "GET",
      url: `${ECHO}/echo?a=1`,
      params: [
        { key: "a", value: "1", enabled: true },
        { key: "off", value: "x", enabled: false },
      ],
    },
  );
  const off = page.getByRole("checkbox", { name: "Send off", exact: true });
  await expect(off).not.toBeChecked();
  await page.locator("input.address-url").fill(`${ECHO}/echo?a=1&b=2`);
  await expect(off).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Send b", exact: true })).toBeChecked();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("img", { name: "Unsaved changes" })).toHaveCount(0);
  await expect
    .poll(async () => JSON.stringify((await dumpIdb(page))["requests"]))
    .toContain('{"key":"off","value":"x","enabled":false}');
});
