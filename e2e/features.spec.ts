import { test, expect, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";
import { seedAndOpen, send } from "./support/app";
import { still } from "./support/settled";

// Claim tests for the README's feature list (docs/claims.md, C-017 onward),
// against the local echo-server in all three engines.

interface Echo {
  method: string;
  url: string;
  headers: [string, string][];
}

/** Clicks Send and returns what the echo-server received. */
async function sendAndEcho(page: Page): Promise<Echo> {
  const response = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
  await send(page);
  return (await (await response).json()) as Echo;
}

const header = (echo: Echo, name: string) => echo.headers.find(([k]) => k === name)?.[1];

/** Replaces navigator.clipboard.writeText with a recorder (no permission prompts in any engine). */
async function recordClipboard(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const written: string[] = [];
    (window as unknown as { __clipboard: string[] }).__clipboard = written;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
  });
  return () => page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard);
}

test("@claim:C-017 any HTTP method can be typed and is sent in upper case, and the seven common ones are offered", async ({ page }) => {
  await page.goto("/");
  const method = page.getByRole("textbox", { name: "HTTP method" });
  await page.getByRole("button", { name: "Common methods" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
  await page.getByRole("menuitem", { name: "PATCH", exact: true }).click();
  await page.locator("input.address-url").fill(`${ECHO}/echo?c017=1`);
  expect((await sendAndEcho(page)).method).toBe("PATCH");

  // Typed in lower case: fetch upper-cases only the common verbs, the composer every one.
  await method.fill("patch");
  await expect(method).toHaveValue("PATCH");
  expect((await sendAndEcho(page)).method).toBe("PATCH");
  await method.fill("purge");
  expect((await sendAndEcho(page)).method).toBe("PURGE");
});

test("TRACE is not sent from the browser, and the page says why", async ({ page }) => {
  await page.goto("/");
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(ECHO)) sent.push(request.method());
  });
  await page.getByRole("textbox", { name: "HTTP method" }).fill("trace");
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await send(page);

  await expect(page.getByText("Browsers do not send TRACE requests. Turn on the Local Bridge to send one.")).toBeVisible();
  expect(sent).toEqual([]);
});

for (const [name, auth, check] of [
  ["Bearer", { type: "bearer", token: "c019-token" }, (e: Echo) => expect(header(e, "authorization")).toBe("Bearer c019-token")],
  ["Basic", { type: "basic", username: "c019-user", password: "c019-pass" }, (e: Echo) =>
    expect(header(e, "authorization")).toBe(`Basic ${Buffer.from("c019-user:c019-pass").toString("base64")}`)],
  ["API key (header)", { type: "apikey", key: "X-C019-Key", value: "c019-value", in: "header" }, (e: Echo) =>
    expect(header(e, "x-c019-key")).toBe("c019-value")],
  ["API key (query)", { type: "apikey", key: "c019key", value: "c019-value", in: "query" }, (e: Echo) =>
    expect(new URL(e.url, ECHO).searchParams.get("c019key")).toBe("c019-value")],
] as const) {
  test(`@claim:C-019 ${name} auth from the Auth tab reaches the server`, async ({ page }) => {
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth });
    check(await sendAndEcho(page));
  });
}

test("@claim:C-020 Copy as cURL copies a runnable command once a URL is entered", async ({ page }) => {
  const clipboard = await recordClipboard(page);
  await page.goto("/");
  const copy = page.getByRole("button", { name: "Copy as cURL" });
  await expect(copy).toBeDisabled();
  await page.locator("input.address-url").fill(`${ECHO}/echo?c020=1`);
  await copy.click();
  await page.getByRole("menuitem", { name: "Copy as cURL", exact: true }).click();
  await expect.poll(clipboard).toHaveLength(1);
  const [curl] = await clipboard();
  expect(curl).toMatch(/^curl /);
  expect(curl).toContain(`${ECHO}/echo?c020=1`);
});

test("@claim:C-021 visual assertions on status, headers, body and duration report in the Tests tab", async ({ page }) => {
  await seedAndOpen(page, {}, {
    method: "GET",
    url: `${ECHO}/content/json?c021=1`,
    tests: [
      { id: "t1", target: "status", operator: "equals", expected: "200" },
      { id: "t2", target: "header", key: "content-type", operator: "contains", expected: "json" },
      { id: "t3", target: "body", key: "title", operator: "equals", expected: "echo fixture" },
      { id: "t4", target: "duration", operator: "less-than", expected: "60000" },
      { id: "t5", target: "body", key: "userId", operator: "greater-than", expected: "5" },
    ],
  });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ }).click();
  await expect(page.locator(".test-result-pass")).toHaveCount(4);
  await expect(page.locator(".test-result-fail")).toHaveCount(1);
});

test("@claim:C-023 phase timings are withheld when the server omits Timing-Allow-Origin", async ({ page }) => {
  await page.goto("/");
  // Allows the (preflighted) request but sends no Timing-Allow-Origin.
  await page.locator("input.address-url").fill(`${ECHO}/cors/no-expose?c023=${Date.now()}`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  const timingsTab = page.locator("app-response-viewer").getByRole("tab", { name: "Timings" });
  await still(timingsTab);
  await timingsTab.click();
  const timings = page.getByRole("tabpanel", { name: "Timings" });
  await expect(timings.getByText("CORS-limited timings")).toBeVisible();
  for (const phase of ["DNS", "Connect", "TLS", "TTFB"]) {
    await expect(timings.getByText(phase, { exact: true })).toHaveCount(0);
  }
});

test("@claim:C-029 history groups entries by day, reloads one into the composer, and deletes one", async ({ page }) => {
  await page.goto("/");
  for (const n of [1, 2]) {
    await page.locator("input.address-url").fill(`${ECHO}/content/json?c029=${n}`);
    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");
  }
  await page.getByRole("button", { name: "Request history", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Request history" });
  await expect(drawer.getByText("Today", { exact: true })).toBeVisible();

  await drawer.getByRole("button", { name: `Load request ${ECHO}/content/json?c029=1 into composer` }).click();
  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/content/json?c029=1`);

  if (!(await drawer.isVisible())) await page.getByRole("button", { name: "Request history", exact: true }).click();
  const entries = drawer.getByRole("button", { name: /^Load request .*c029=/ });
  await expect(entries).toHaveCount(2);
  await drawer.getByRole("button", { name: "Delete history entry" }).first().click();
  // One confirmation, not one per history entry stacked on top of each other.
  const popup = page.getByRole("alertdialog", { name: "Remove this request from history?" });
  await expect(popup).toHaveCount(1);
  await popup.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(entries).toHaveCount(1);
});

test("@claim:C-034 animations respect prefers-reduced-motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?c034=1`);
  await send(page);
  const arrive = page.locator(".animate-response-arrive").first();
  await expect(arrive).toBeVisible();
  expect(parseFloat(await arrive.evaluate((el) => getComputedStyle(el).animationDuration))).toBeLessThan(0.01);

  // Angular Material's own motion too: a drawer's slide, a tab's sliding
  // underline and a dialog's entrance all end at once.
  const seconds = (selector: string, property: "transitionDuration" | "animationDuration") =>
    page.locator(selector).first().evaluate((el, p) => Math.max(...getComputedStyle(el)[p].split(",").map(parseFloat)), property);
  expect(await seconds("mat-sidenav.mat-drawer-end", "transitionDuration")).toBeLessThan(0.01);
  expect(await seconds(".tab-bar .mdc-tab-indicator__content", "transitionDuration")).toBeLessThan(0.01);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  expect(await seconds(".mat-mdc-dialog-surface", "animationDuration")).toBeLessThan(0.01);
});

test("@claim:C-035 Export → Copy as HAR produces a HAR 1.2 log of the exchange", async ({ page }) => {
  const clipboard = await recordClipboard(page);
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?c035=1`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  // The response slides in; a button that moves between press and release takes no click.
  await still(page.getByRole("button", { name: "Export response" }));
  await page.getByRole("button", { name: "Export response" }).click();
  await page.getByRole("menuitem", { name: "Copy as HAR", exact: true }).click();
  await expect.poll(clipboard).toHaveLength(1);
  const har = JSON.parse((await clipboard())[0]) as { log: { version: string; entries: { request: { url: string }; response: { status: number } }[] } };
  expect(har.log.version).toBe("1.2");
  expect(har.log.entries[0].request.url).toBe(`${ECHO}/content/json?c035=1`);
  expect(har.log.entries[0].response.status).toBe(200);
});

test("@claim:C-036 the app is installable: a web app manifest with name, start URL, standalone display and 192/512 icons", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(`/${href}`)).json();
  expect(manifest.name).toBe("Wayfarer");
  expect(manifest.start_url).toBeTruthy();
  expect(["standalone", "fullscreen", "minimal-ui"]).toContain(manifest.display);
  const sizes = (manifest.icons as { sizes: string }[]).map((i) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(`/${icon.src.replace(/^\//, "")}`)).status(), icon.src).toBe(200);
  }
});

test("@claim:C-039 the Body tab is there for every method but GET and HEAD, and offers none, raw, form, multipart and binary", async ({ page }) => {
  await page.goto("/");
  const bodyTab = page.getByRole("tab", { name: "Body", exact: true });
  const method = page.getByRole("textbox", { name: "HTTP method" });
  // A new request is a GET.
  await expect(bodyTab).toHaveCount(0);
  for (const [name, tabs] of [["HEAD", 0], ["DELETE", 1], ["OPTIONS", 1], ["PATCH", 1], ["PUT", 1], ["POST", 1]] as const) {
    await method.fill(name);
    await expect(bodyTab, name).toHaveCount(tabs);
  }

  await bodyTab.first().click();
  await page.getByRole("combobox", { name: "Body", exact: true }).click();
  await expect(page.getByRole("option")).toHaveText(["None", "Raw", "Form (URL-encoded)", "Multipart", "Binary file"]);
  await page.getByRole("option", { name: "Raw", exact: true }).click();
  await page.getByRole("combobox", { name: "Raw body language" }).click();
  await expect(page.getByRole("option")).toHaveText(["JSON", "Text", "XML", "HTML", "JavaScript"]);
});

async function createCollection(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New collection" }).click();
  await page.locator("#creation-name-input").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

const treeItem = (page: Page, name: string) => page.getByRole("treeitem", { name, exact: true });
/** Names of the tree's rows, top to bottom, limited to those starting with `prefix`. */
const treeOrder = (page: Page, prefix: string) => async () =>
  (await page.getByRole("treeitem").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label") ?? ""))).filter((name) => name.startsWith(prefix));

/** Opens a row's context menu (`size` items once it shows that row's actions), picks an item, and fills the creation dialog. */
async function createUnder(page: Page, parent: string, size: number, item: string, name: string): Promise<void> {
  await page.getByRole("tree").getByText(parent, { exact: true }).click({ button: "right" });
  await expect(page.getByRole("menuitem")).toHaveCount(size);
  await page.getByRole("menuitem", { name: item }).click();
  await page.locator("#creation-name-input").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("@claim:C-024 collections can be renamed inline and reordered by drag and drop, and both survive a reload", async ({ page }) => {
  await page.goto("/");
  await createCollection(page, "C024 Alpha");
  await createCollection(page, "C024 Beta");

  await page.getByText("C024 Alpha", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByRole("tree").getByRole("textbox");
  await input.fill("C024 Gamma");
  await input.press("Enter");
  await expect(page.getByText("C024 Gamma", { exact: true })).toBeVisible();

  const order = treeOrder(page, "C024");
  expect(await order()).toEqual(["C024 Gamma", "C024 Beta"]);
  // Drop Beta on the top edge of Gamma's row: "insert before".
  await treeItem(page, "C024 Beta").dragTo(treeItem(page, "C024 Gamma"), { targetPosition: { x: 12, y: 2 } });
  await expect.poll(order).toEqual(["C024 Beta", "C024 Gamma"]);

  await page.reload();
  await expect.poll(order).toEqual(["C024 Beta", "C024 Gamma"]);
});

test("folders and requests are reordered by drag and drop among their own kind, and a drop onto a folder moves nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await createCollection(page, "Drag Col");
  await createUnder(page, "Drag Col", 8, "New Folder", "Drag Folder A");
  await createUnder(page, "Drag Col", 8, "New Folder", "Drag Folder B");
  await createUnder(page, "Drag Col", 8, "New Request", "Drag Req 1");
  await createUnder(page, "Drag Col", 8, "New Request", "Drag Req 2");
  const order = treeOrder(page, "Drag ");
  await expect.poll(order).toEqual(["Drag Col", "Drag Folder A", "Drag Folder B", "Drag Req 1", "Drag Req 2"]);

  // A request before its sibling.
  await treeItem(page, "Drag Req 2").dragTo(treeItem(page, "Drag Req 1"), { targetPosition: { x: 40, y: 2 } });
  await expect.poll(order).toEqual(["Drag Col", "Drag Folder A", "Drag Folder B", "Drag Req 2", "Drag Req 1"]);

  // A folder before its sibling.
  await treeItem(page, "Drag Folder B").dragTo(treeItem(page, "Drag Folder A"), { targetPosition: { x: 40, y: 2 } });
  await expect.poll(order).toEqual(["Drag Col", "Drag Folder B", "Drag Folder A", "Drag Req 2", "Drag Req 1"]);

  // A request dropped on the middle of a folder's row stays where it was.
  await treeItem(page, "Drag Req 1").dragTo(treeItem(page, "Drag Folder A"), { targetPosition: { x: 40, y: 19 } });
  await page.reload();
  await expect.poll(order).toEqual(["Drag Col", "Drag Folder B", "Drag Folder A", "Drag Req 2", "Drag Req 1"]);
});

test("@claim:C-033 Settings exports environments to a file and imports them back into a fresh browser", async ({ page, browser }) => {
  await seedAndOpen(page, { c033: "value-c033" }, { method: "GET", url: `${ECHO}/echo` });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("dialog").getByRole("button", { name: "Export environments" }).click(),
  ]);
  const file = await download.path();

  const fresh = await browser.newContext({ serviceWorkers: "block" });
  const other = await fresh.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Settings", exact: true }).click();
  await other.getByLabel("Import environments from file").setInputFiles(file);
  await other.keyboard.press("Escape");
  await expect(other.locator(".env-item", { hasText: "Tripwire env" })).toBeVisible();
  await fresh.close();
});

test("@claim:C-029 Clear all history empties the history", async ({ page }) => {
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?c029clear=1`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await page.getByRole("button", { name: "Request history", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Request history" });
  await expect(drawer.getByRole("button", { name: /^Load request .*c029clear=1/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear all history" }).click();
  const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "Your entire history will be cleared" });
  await confirm.getByRole("button", { name: "Proceed", exact: true }).click();
  await expect(drawer.getByRole("button", { name: /^Load request / })).toHaveCount(0);
});

test("@claim:C-035 Export → Copy as cURL copies the exchange's request", async ({ page }) => {
  const clipboard = await recordClipboard(page);
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?c035curl=1`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await page.getByRole("button", { name: "Export response" }).click();
  await page.getByRole("menuitem", { name: "Copy as cURL", exact: true }).click();
  await expect.poll(clipboard).toHaveLength(1);
  expect((await clipboard())[0]).toContain(`${ECHO}/content/json?c035curl=1`);
});

// Tooltips and the history details card are
// reachable with the keyboard alone, and dismissible.
test("a tooltip opens on keyboard focus, describes its button, and closes on Escape", async ({ page, browserName }) => {
  await page.goto("/");
  // Off the window's corner: a headless pointer rests at (0, 0), which is
  // where the CDK first places an overlay before positioning it. Material
  // hides a tooltip the pointer has entered and then left.
  await page.mouse.move(640, 600);
  await page.locator("input.address-url").fill(`${ECHO}/content/json?tooltip=1`);

  // Reach the button with the keyboard: Material shows a tooltip for
  // keyboard focus only. Safari tabs to non-inputs with Option+Tab.
  const curl = page.getByRole("button", { name: "Copy as cURL" });
  await page.locator("input.address-url").focus();
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  for (let i = 0; i < 4 && !(await curl.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press(tab);
  await expect(curl).toBeFocused();
  const tooltip = page.locator(".mat-mdc-tooltip");
  await expect(tooltip).toHaveText("Copy as cURL");
  // The tooltip repeats the button's name, so Material adds no description:
  // a screen reader would say the same words twice.
  await expect(curl).toHaveAccessibleName("Copy as cURL");
  await expect(curl).not.toHaveAttribute("aria-describedby");

  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await expect(curl).toBeFocused();

  // The app is still usable: the next button takes the click.
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
});

test("a history entry shows its details on keyboard focus and hides them on blur", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?details=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await page.getByRole("button", { name: "Request history" }).click();

  // Reach the entry with the keyboard: focus that scripts or clicks set does
  // not open the card. Safari tabs to non-inputs with Option+Tab.
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  const entry = page.getByRole("button", { name: /^Load request .*details=1 into composer$/ });
  // The drawer takes focus when it opens; walk on from there.
  const tabToEntry = async () => {
    for (let i = 0; i < 4 && !(await entry.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press(tab);
    await expect(entry).toBeFocused();
  };
  await tabToEntry();
  // The next stop, the entry's Delete button, has a tooltip of its own.
  const card = page.getByRole("tooltip").filter({ hasText: "Status: 200" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("details=1");

  await page.keyboard.press(tab);
  await expect(entry).not.toBeFocused();
  await expect(card).toHaveCount(0);

  // Escape closes it too.
  await page.keyboard.press(`Shift+${tab}`);
  await expect(entry).toBeFocused();
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
});


// Material fades a select's placeholder to its colour over half a second.
// After a switch to the light theme "No environment" stayed white on the
// light toolbar for that long.
test("switching the theme recolours the environment select at once", async ({ page }) => {
  await page.goto("/");
  const select = page.getByRole("banner").getByRole("combobox", { name: "Environment", exact: true });
  await expect(select).toHaveText("No environment");
  await page.getByRole("banner").getByRole("button", { name: "Switch to light mode" }).click();
  const colours = await select.evaluate((host) => {
    const text = host.querySelector(".mat-mdc-select-min-line");
    return { host: getComputedStyle(host).color, text: text && getComputedStyle(text).color };
  });
  expect(colours.text).toBe(colours.host);
});
