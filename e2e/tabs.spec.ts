import { test, expect, type Locator, type Page } from "@playwright/test";
import { dumpIdb, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// P5.1: the composer's tabs. What a reload keeps of them is in the second half of this file.

interface StoredTab {
  id: string;
  draft: { url: string; scripts: { pre: string; post: string } };
  scripts: string[];
  requestId?: string;
}

/** The `tabs` store, once it holds what `settled` asks for: a tab is written a moment after it changed. */
async function storedTabs(page: Page, settled: (tabs: StoredTab[]) => boolean): Promise<StoredTab[]> {
  await expect.poll(async () => settled(((await dumpIdb(page))["tabs"] ?? []) as StoredTab[])).toBe(true);
  return (await dumpIdb(page))["tabs"] as StoredTab[];
}

const strip = (page: Page): Locator => page.getByRole("tablist", { name: "Open requests" });
const tabs = (page: Page): Locator => strip(page).getByRole("tab");
const address = (page: Page): Locator => page.locator("input.address-url");
const unsaved = (tab: Locator): Locator => tab.getByRole("img", { name: "Unsaved changes" });

test("a new tab is an empty request, and each tab keeps its own request and response", async ({ page }) => {
  await page.goto("/app/");
  await expect(tabs(page)).toHaveCount(1);
  await address(page).fill(`${ECHO}/content/json?keys=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

  await page.getByRole("button", { name: "New tab" }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(address(page)).toHaveValue("");
  await expect(address(page)).toBeFocused();
  await expect(page.locator(".status-badge")).toHaveCount(0);
  await address(page).fill(`${ECHO}/status/204`);

  await tabs(page).nth(0).click();
  await expect(address(page)).toHaveValue(`${ECHO}/content/json?keys=1`);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await tabs(page).nth(1).click();
  await expect(address(page)).toHaveValue(`${ECHO}/status/204`);
});

test("a tab says what it holds: the method and the address, or the saved request's name and where it is kept", async ({
  page,
}) => {
  await seedAndOpen(page, {}, { method: "POST", url: `${ECHO}/echo`, folder: {} });
  await expect(tabs(page)).toHaveCount(1);
  await expect(tabs(page).first()).toContainText("POST");
  await expect(tabs(page).first()).toContainText("Tripwire request");
  await expect(unsaved(tabs(page).first())).toHaveCount(0);
  const crumbs = page.getByRole("navigation", { name: "Saved request" });
  await expect(crumbs).toHaveText(/Tripwire collection\s*\/\s*Tripwire folder\s*\/\s*Tripwire request/);

  await page.getByRole("button", { name: "New tab" }).click();
  await expect(crumbs).toHaveCount(0);
  await expect(tabs(page).nth(1)).toContainText("New request");
  await address(page).fill("https://api.example.test/items");
  await expect(tabs(page).nth(1)).toContainText("api.example.test/items");
});

test("an edit marks the tab unsaved; a saved request opened again goes to its tab, edits kept", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  await address(page).fill(`${ECHO}/echo?edited=1`);
  await expect(unsaved(tabs(page).first())).toBeVisible();

  await page.getByRole("button", { name: "New tab" }).click();
  await page.getByRole("tree").getByText("Tripwire request", { exact: true }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).first()).toHaveAttribute("aria-selected", "true");
  await expect(address(page)).toHaveValue(`${ECHO}/echo?edited=1`);

  // Saved: the mark goes.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(unsaved(tabs(page).first())).toHaveCount(0);
});

test("closing a tab with unsaved changes asks first; a clean one closes at once", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "New tab" }).click();
  await expect(tabs(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Close tab" }).click();
  await expect(tabs(page)).toHaveCount(1);

  await address(page).fill("https://api.example.test/keep");
  await page.getByRole("button", { name: "Close tab" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Close this tab?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep it open" }).click();
  await expect(address(page)).toHaveValue("https://api.example.test/keep");

  await page.getByRole("button", { name: "Close tab" }).click();
  await dialog.getByRole("button", { name: "Close tab" }).click();
  // The last tab is replaced by an empty one.
  await expect(tabs(page)).toHaveCount(1);
  await expect(address(page)).toHaveValue("");
});

test("Duplicate tab opens a second tab with the same request, unsaved changes included", async ({ page }) => {
  await page.goto("/app/");
  await address(page).fill("https://api.example.test/copy");
  await page.getByRole("button", { name: "Duplicate tab" }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(address(page)).toHaveValue("https://api.example.test/copy");
  await expect(unsaved(tabs(page).nth(1))).toBeVisible();

  await address(page).fill("https://api.example.test/changed");
  await tabs(page).nth(0).click();
  await expect(address(page)).toHaveValue("https://api.example.test/copy");
});

test("keyboard: Alt+T opens a tab and Alt+W closes it, in the app and not in the browser; arrow keys walk the strip", async ({
  page,
  context,
}) => {
  await page.goto("/app/");
  await address(page).fill("https://api.example.test/first");
  // In the address field, where on macOS Option+T would type a dagger.
  await page.keyboard.press("Alt+KeyT");
  await expect(tabs(page)).toHaveCount(2);
  await expect(address(page)).toHaveValue("");
  await expect(address(page)).toBeFocused();
  await page.keyboard.press("Alt+KeyT");
  await expect(tabs(page)).toHaveCount(3);
  await expect(address(page)).toHaveValue("");

  await tabs(page).nth(2).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs(page).nth(1)).toBeFocused();
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tabs(page).nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(address(page)).toHaveValue("https://api.example.test/first");
  await expect(strip(page).locator('[role="tab"][tabindex="0"]')).toHaveCount(1);

  await page.keyboard.press("End");
  await page.keyboard.press("Alt+KeyW");
  await expect(tabs(page)).toHaveCount(2);
  await page.keyboard.press("Alt+KeyW");
  await expect(tabs(page)).toHaveCount(1);
  await expect(address(page)).toHaveValue("https://api.example.test/first");

  // The browser opened no tab of its own and closed none.
  expect(context.pages()).toHaveLength(1);
  expect(page.isClosed()).toBe(false);
  await expect(page).toHaveURL(/\/$/);
});

// #360: Alt+T pressed before the app had drawn the last keystroke left the new tab's field showing the old tab's address.
test("each tab controls a panel: the open one's is the composer, named by its tab; the others' are hidden and empty", async ({
  page,
}) => {
  await page.goto("/app/");
  await address(page).fill(`${ECHO}/echo?first=1`);
  await page.keyboard.press("Alt+KeyT");
  await page.keyboard.press("Alt+KeyT");
  await expect(tabs(page)).toHaveCount(3);
  await tabs(page).nth(1).click();

  const panels = await tabs(page).evaluateAll((all) =>
    all.map((tab) => {
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      return {
        selected: tab.getAttribute("aria-selected"),
        role: panel?.getAttribute("role"),
        labelledBy: panel?.getAttribute("aria-labelledby") === tab.id,
        inert: panel?.hasAttribute("inert"),
        holdsAddress: !!panel?.querySelector("input.address-url"),
      };
    }),
  );
  expect(panels).toEqual([
    { selected: "false", role: "tabpanel", labelledBy: true, inert: true, holdsAddress: false },
    { selected: "true", role: "tabpanel", labelledBy: true, inert: false, holdsAddress: true },
    { selected: "false", role: "tabpanel", labelledBy: true, inert: true, holdsAddress: false },
  ]);
  // The composer is the same element as the tabs change: what it holds is not made again.
  const before = await page.locator("app-address-row").elementHandle();
  await tabs(page).nth(0).click();
  await expect(address(page)).toHaveValue(`${ECHO}/echo?first=1`);
  expect(await before?.evaluate((element) => element.isConnected)).toBe(true);
});

test("Alt+T in the same task as the last keystroke opens a tab whose field shows its own empty address", async ({
  page,
}) => {
  await page.goto("/app/");
  await expect(address(page)).toBeVisible();
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("input.address-url");
    if (!input) throw new Error("no address field");
    input.focus();
    input.value = "https://api.example.test/first";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyT", key: "t", altKey: true, bubbles: true }));
  });
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  // The draft beside the field: the tab's name is its draft's address, or "New request".
  await expect(tabs(page).nth(0)).toContainText("api.example.test/first");
  await expect(tabs(page).nth(1)).toContainText("New request");
  await expect(address(page)).toHaveValue("");
  await tabs(page).nth(0).click();
  await expect(address(page)).toHaveValue("https://api.example.test/first");
});

// A send holds the tab it was started in (session 5B; the maintainer's answer, plan v1.2.41). Until then the open tab could not be changed while a request was on its way.
test("a tab may be left while its request is on its way, and its response is there on the way back", async ({
  page,
}) => {
  await page.goto("/app/");
  await address(page).fill(`${ECHO}/delay/3000`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("button", { name: "Cancel request" })).toBeVisible();

  await page.getByRole("button", { name: "New tab" }).click();
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
  await address(page).fill(`${ECHO}/status/204`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("204", { timeout: 15_000 });

  await tabs(page).nth(0).click();
  await expect(address(page)).toHaveValue(`${ECHO}/delay/3000`);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await tabs(page).nth(1).click();
  await expect(page.locator(".status-badge")).toHaveText("204");
});

test("closing a tab whose request is on its way asks first, and cancels the request", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "New tab" }).click();
  // Longer than the test may take: only a cancel ends this request in time.
  await address(page).fill(`${ECHO}/delay/60000`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("button", { name: "Cancel request" })).toBeVisible();

  await page.getByRole("button", { name: "Close tab" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Close this tab?" });
  await expect(dialog).toContainText("is waiting for a response");
  await dialog.getByRole("button", { name: "Keep it open" }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Cancel request" })).toBeVisible();

  await page.getByRole("button", { name: "Close tab" }).click();
  await dialog.getByRole("button", { name: "Close tab" }).click();
  await expect(tabs(page)).toHaveCount(1);
  // The send ended as a cancelled one: history has it. (WebKit on Linux reports no "requestfailed" for an aborted fetch.)
  await expect
    .poll(async () => ((await dumpIdb(page))["history"] as { error?: string }[]).map((entry) => entry.error))
    .toEqual(["The request was cancelled."]);
});

test("the open tab is in view when the strip holds more tabs than fit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/app/");
  for (let opened = 1; opened <= 6; opened++) {
    await page.getByRole("button", { name: "New tab" }).click();
    await expect(tabs(page)).toHaveCount(opened + 1);
  }
  await expect(tabs(page).nth(6)).toBeInViewport({ ratio: 1 });
  await expect(tabs(page).nth(0)).not.toBeInViewport();
});

// ── What is stored (the `tabs` store) ──────────────────────────────────────

test("five tabs, two of them edited, are all there after a reload, the two still unsaved and the open one still open", async ({
  page,
}) => {
  await page.goto("/app/");
  for (let opened = 1; opened < 5; opened++) await page.getByRole("button", { name: "New tab" }).click();
  await expect(tabs(page)).toHaveCount(5);
  await tabs(page).nth(1).click();
  await address(page).fill("https://api.example.test/second");
  await tabs(page).nth(3).click();
  await address(page).fill("https://api.example.test/fourth?page=2");
  await page.getByRole("tab", { name: "Headers", exact: true }).click();
  await page.locator("app-headers-panel").getByPlaceholder("Name", { exact: true }).first().fill("X-Kept");
  await page.locator("app-headers-panel").getByPlaceholder("Value", { exact: true }).first().fill("over a reload");
  await storedTabs(page, (stored) => stored.length === 5 && JSON.stringify(stored).includes("over a reload"));

  await page.reload();

  await expect(tabs(page)).toHaveCount(5);
  for (const [index, edited] of [false, true, false, true, false].entries()) {
    await expect(unsaved(tabs(page).nth(index)), `tab ${index + 1}`).toHaveCount(edited ? 1 : 0);
  }
  await expect(tabs(page).nth(3)).toHaveAttribute("aria-selected", "true");
  await expect(address(page)).toHaveValue("https://api.example.test/fourth?page=2");
  // An opened request starts on Params (U-017).
  await page.locator(".composer-pane").getByRole("tab", { name: "Headers", exact: true }).click();
  await expect(page.locator("app-headers-panel").getByPlaceholder("Name", { exact: true }).first()).toHaveValue(
    "X-Kept",
  );
  await expect(page.locator("app-headers-panel").getByPlaceholder("Value", { exact: true }).first()).toHaveValue(
    "over a reload",
  );
  await tabs(page).nth(1).click();
  await expect(address(page)).toHaveValue("https://api.example.test/second");
  await tabs(page).nth(0).click();
  await expect(address(page)).toHaveValue("");
});

test("a restored tab shows the response of its last send, as history kept it, and the saved request it belongs to", async ({
  page,
}) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/content/json?keys=2` });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await storedTabs(
    page,
    (stored) =>
      stored.length === 1 && stored[0].requestId === "req-tw" && JSON.stringify(stored[0]).includes("historyKey"),
  );

  await page.reload();

  await expect(tabs(page)).toHaveCount(1);
  await expect(tabs(page).first()).toContainText("Tripwire request");
  await expect(page.getByRole("navigation", { name: "Saved request" })).toContainText("Tripwire collection");
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect(unsaved(tabs(page).first())).toHaveCount(0);
  // Save still writes back to the request: the tab is bound, not a copy.
  await address(page).fill(`${ECHO}/content/json?keys=3`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => ((await dumpIdb(page))["requests"] as { url: string }[])[0].url)
    .toBe(`${ECHO}/content/json?keys=3`);
});

test("a script of a restored tab runs when it was allowed as the tab was stored, and waits for a review when the stored tab holds another", async ({
  page,
}) => {
  const violations: string[] = [];
  await page.exposeFunction("cspViolation", (directive: string) => violations.push(directive));
  await page.addInitScript(() =>
    addEventListener(
      "securitypolicyviolation",
      (event) => void (window as unknown as { cspViolation(d: string): void }).cspViolation(event.violatedDirective),
    ),
  );
  await seedAndOpen(
    page,
    {},
    { method: "GET", url: `${ECHO}/content/json?keys=1`, postRequestScript: 'pm.test("ran as stored", () => {});' },
  );
  // Changed in the tab, so the tab is what is restored, not the saved request.
  await address(page).fill(`${ECHO}/content/json?keys=2`);
  const [stored] = await storedTabs(
    page,
    (all) => all.length === 1 && all[0].draft.url.endsWith("keys=2") && all[0].scripts.length === 1,
  );
  expect(stored.scripts[0]).toMatch(/^[0-9a-f]{64}$/);

  await page.reload();
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await page
    .locator("app-response-viewer")
    .getByRole("tab", { name: /^Tests/ })
    .click();
  await expect(page.locator("app-response-viewer")).toContainText("ran as stored");

  // The send is stored with the tab (where its response is kept) before anything else writes to the record.
  await storedTabs(page, (all) => JSON.stringify(all[0]).includes("historyKey"));
  // Something else writes another script into the stored tab. Its digest is not the one stored with the tab.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("wayfarer");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const store = db.transaction("tabs", "readwrite").objectStore("tabs");
    const all = await new Promise<{ draft: { scripts: { post: string } } }[]>((resolve) => {
      const read = store.getAll();
      read.onsuccess = () => resolve(read.result);
    });
    all[0].draft.scripts.post = 'pm.test("put there from outside", () => {});';
    await new Promise<void>((resolve, reject) => {
      const write = store.put(all[0]);
      write.onsuccess = () => resolve();
      write.onerror = () => reject(write.error);
    });
    db.close();
  });
  await page.reload();
  await expect(address(page)).toHaveValue(`${ECHO}/content/json?keys=2`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await page
    .locator("app-response-viewer")
    .getByRole("tab", { name: /^Tests/ })
    .click();
  await expect(page.locator("app-response-viewer")).not.toContainText("put there from outside");
  await page.locator(".composer-pane").getByRole("tab", { name: "Scripts", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review scripts" })).toBeVisible();
  expect(violations).toEqual([]);
});

test("two browser tabs share the composer's tabs: one opened or closed in one is opened or closed in the other, and each keeps its own open tab", async ({
  context,
}) => {
  const one = await context.newPage();
  const two = await context.newPage();
  await one.goto("/app/");
  await two.goto("/app/");
  await expect(tabs(two)).toHaveCount(1);

  await address(one).fill("https://api.example.test/from-one");
  await one.getByRole("button", { name: "New tab" }).click();
  await address(one).fill("https://api.example.test/second-from-one");

  await expect(tabs(two)).toHaveCount(2);
  await expect(tabs(two).nth(0)).toContainText("api.example.test/from-one");
  await expect(tabs(two).nth(1)).toContainText("api.example.test/second-from-one");
  // Each browser tab is where it was: the second composer tab in one, the first in two.
  await expect(tabs(one).nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs(two).nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(address(two)).toHaveValue("https://api.example.test/from-one");

  // An edit in two reaches one.
  await address(two).fill("https://api.example.test/changed-in-two");
  await expect(tabs(one).nth(0)).toContainText("api.example.test/changed-in-two");

  // Closed in two, with its question answered: gone in one.
  await two.getByRole("button", { name: "Close tab" }).click();
  await two.getByRole("alertdialog", { name: "Close this tab?" }).getByRole("button", { name: "Close tab" }).click();
  await expect(tabs(two)).toHaveCount(1);
  await expect(tabs(one)).toHaveCount(1);
  await expect(address(one)).toHaveValue("https://api.example.test/second-from-one");
});

// "What session 5A left for 5B", item 5, fixed in 5C: a tab's saved request was a copy of it.
test("a request renamed in the tree is renamed in its tab at once, and one deleted there leaves its tab a request that is not saved", async ({
  page,
}) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo?kept=1` });
  const tree = page.getByRole("tree");
  await expect(strip(page).getByRole("tab", { selected: true })).toContainText("Tripwire request");

  await tree.getByText("Tripwire request", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await tree.getByRole("textbox").fill("Renamed in the tree");
  await tree.getByRole("textbox").press("Enter");
  // Without a reload: the tab's name, and the line that says where the request is kept.
  await expect(strip(page).getByRole("tab", { selected: true })).toContainText("Renamed in the tree");
  await expect(page.locator("app-composer")).toContainText("Tripwire collection / Renamed in the tree");
  // A rename is not an edit of the request.
  await expect(strip(page).getByRole("tab", { selected: true })).not.toContainText("unsaved");

  await tree.getByText("Renamed in the tree", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete item?" })
    .getByRole("button", { name: "Proceed", exact: true })
    .click();
  await expect(tree.getByText("Renamed in the tree", { exact: true })).toHaveCount(0);
  // The tab keeps what it held, as a request of no collection: its name is its address again.
  await expect(address(page)).toHaveValue(`${ECHO}/echo?kept=1`);
  await expect(strip(page).getByRole("tab", { selected: true })).toContainText("127.0.0.1:4300/echo?kept=1");
  await expect(page.locator("app-composer")).not.toContainText("Tripwire collection /");
  // And it is sent like one.
  await send(page);
  await expect(page.locator(".status-badge").first()).toHaveText("200");
});

// "What session 5A left for 5B", item 7, checked in 5C: one editor is given each tab's text in turn.
test("the editor's undo does not bring another tab's text into this one", async ({ page }) => {
  await page.goto("/app/");
  const editor = page.locator("app-script-editor .monaco-editor").first();
  const text = async () => (await editor.locator(".view-lines").innerText()).replace(/\s+/g, " ").trim();
  const typeInto = async (script: string) => {
    await page.getByRole("tab", { name: "Scripts", exact: true }).first().click();
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await editor.click();
    await page.keyboard.type(script);
    await expect.poll(text).toBe(script);
  };

  await address(page).fill("https://api.example.test/first");
  await typeInto("first();");
  await page.getByRole("button", { name: "New tab" }).click();
  await address(page).fill("https://api.example.test/second");
  await typeInto("second();");

  // Back in the first tab: its own script, and an undo there has nothing of the second tab's to bring back.
  await tabs(page).first().click();
  await expect.poll(text).toBe("first();");
  await editor.click();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ControlOrMeta+z");
  expect(await text()).not.toContain("second");
  // What the first tab holds is still its own.
  const first = (
    await storedTabs(page, (stored) => stored.length === 2 && JSON.stringify(stored).includes("second();"))
  ).find((tab) => tab.draft.url.endsWith("/first"));
  expect(first?.draft.scripts.pre ?? "").not.toContain("second");
  // And the second tab was not changed by an undo made in the first.
  await tabs(page).nth(1).click();
  await expect.poll(text).toBe("second();");
});
