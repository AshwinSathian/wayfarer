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

test("@claim:C-017 the composer offers GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS, and sends the one chosen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: /^HTTP method/ }).click();
  await expect(page.getByRole("option")).toHaveText(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
  await page.getByRole("option", { name: "PATCH", exact: true }).click();
  await page.locator("input.address-url").fill(`${ECHO}/echo?c017=1`);
  expect((await sendAndEcho(page)).method).toBe("PATCH");
});

for (const [name, auth, check] of [
  ["Bearer", { type: "bearer", bearer: { token: "c019-token" } }, (e: Echo) => expect(header(e, "authorization")).toBe("Bearer c019-token")],
  ["Basic", { type: "basic", basic: { username: "c019-user", password: "c019-pass" } }, (e: Echo) =>
    expect(header(e, "authorization")).toBe(`Basic ${Buffer.from("c019-user:c019-pass").toString("base64")}`)],
  ["API key (header)", { type: "api-key", apiKey: { key: "X-C019-Key", value: "c019-value", addTo: "header" } }, (e: Echo) =>
    expect(header(e, "x-c019-key")).toBe("c019-value")],
  ["API key (query)", { type: "api-key", apiKey: { key: "c019key", value: "c019-value", addTo: "query" } }, (e: Echo) =>
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
  await page.getByRole("menuitem", { name: "Copy as HAR" }).click();
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

test("@claim:C-039 the Body tab exists only for POST, PUT and PATCH, with a Basic/JSON editor switch", async ({ page }) => {
  await page.goto("/");
  const bodyTab = page.getByRole("tab", { name: "Body", exact: true });
  await expect(bodyTab).toHaveCount(0);
  await page.getByRole("combobox", { name: /^HTTP method/ }).click();
  await page.getByRole("option", { name: "POST", exact: true }).click();
  await bodyTab.first().click();
  await expect(page.getByRole("radio", { name: "JSON" }).or(page.getByRole("button", { name: "JSON", exact: true })).first()).toBeVisible();
});

async function createCollection(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New collection" }).click();
  await page.locator("#creation-name-input").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

test("@claim:C-024 collections can be renamed inline and reordered by drag and drop, and both survive a reload", async ({ page }) => {
  await page.goto("/");
  await createCollection(page, "C024 Alpha");
  await createCollection(page, "C024 Beta");

  await page.getByText("C024 Alpha", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.locator("p-tree input");
  await input.fill("C024 Gamma");
  await input.press("Enter");
  await expect(page.getByText("C024 Gamma", { exact: true })).toBeVisible();

  const names = () => page.locator("p-tree .p-tree-node-label").allInnerTexts();
  const order = async () => (await names()).map((n) => n.trim()).filter((n) => n.startsWith("C024"));
  expect(await order()).toEqual(["C024 Gamma", "C024 Beta"]);
  // Drop Beta on the top quarter of Gamma's row: PrimeNG's "insert before" zone.
  const row = (name: string) => page.locator(`li[role="treeitem"][aria-label="${name}"] > .p-tree-node-content`);
  await row("C024 Beta").dragTo(row("C024 Gamma"), { targetPosition: { x: 12, y: 2 } });
  await expect.poll(order).toEqual(["C024 Beta", "C024 Gamma"]);

  await page.reload();
  await expect.poll(order).toEqual(["C024 Beta", "C024 Gamma"]);
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
  await page.getByRole("menuitem", { name: "Copy as cURL" }).click();
  await expect.poll(clipboard).toHaveLength(1);
  expect((await clipboard())[0]).toContain(`${ECHO}/content/json?c035curl=1`);
});

// Slice 2 of the PrimeNG removal: tooltips and the history details card are
// reachable with the keyboard alone, and dismissible.
test("a tooltip opens on keyboard focus, describes its button, and closes on Escape", async ({ page }) => {
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?tooltip=1`);

  const curl = page.getByRole("button", { name: "Copy as cURL" });
  await curl.focus();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveText("Copy as cURL");
  const describedBy = await page.locator(".curl-btn-wrap").getAttribute("aria-describedby");
  expect(describedBy).toBe(await tooltip.getAttribute("id"));

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

