import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";
import { settled } from "./support/settled";

// P5.7: a WebSocket in a tab. The echo server's /ws sends back what it is sent.

const WS = `${ECHO.replace(/^http/, "ws")}/ws`;
const address = (page: Page): Locator => page.locator("input.address-url");
const view = (page: Page): Locator => page.locator("app-socket-view");
const logRows = (page: Page): Locator => view(page).getByRole("region", { name: "WebSocket log" }).locator("tbody tr");
/** The log without its times: direction, message, size. */
const log = (page: Page) => logRows(page).evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll("td")].slice(1).map((cell) => cell.textContent?.trim() ?? "")));

/** Sends `text` and waits for the echo's answer: two more lines in the log. */
async function say(page: Page, text: string, send = () => view(page).getByRole("button", { name: "Send message" }).click()): Promise<void> {
  const before = await logRows(page).count();
  await view(page).getByLabel("Message").fill(text);
  await send();
  await expect(logRows(page)).toHaveCount(before + 2);
}

test("three messages sent to an echo are logged in order, each with its answer, its direction and its size", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __violations: string[] }).__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => (window as unknown as { __violations: string[] }).__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  const response = await page.goto("/");
  // Under the production policy, which names no ws: source: `connect-src *` admits it.
  expect(response?.headers()["content-security-policy"]).toContain("connect-src *");
  await address(page).fill(WS);
  await expect(view(page)).toBeVisible();
  await expect(view(page).getByRole("status")).toHaveText("Not connected");
  await expect(page.getByRole("tablist", { name: "Open requests" }).getByRole("tab").first()).toContainText("WS");

  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(view(page).getByRole("status")).toHaveText("Connected");
  await say(page, "first");
  await say(page, '{"n":2}');
  // Sent with Enter, as well as with the button.
  await say(page, "third: käse", () => view(page).getByLabel("Message").press("Enter"));

  await expect(logRows(page)).toHaveCount(8);
  expect(await log(page)).toEqual([
    ["—", `Connecting to ${WS}`, "—"],
    ["—", "Connected.", "—"],
    ["Sent", "first", "5 B"],
    ["Received", "first", "5 B"],
    ["Sent", '{"n":2}', "7 B"],
    ["Received", '{"n":2}', "7 B"],
    ["Sent", "third: käse", "12 B"],
    ["Received", "third: käse", "12 B"],
  ]);
  const times = await logRows(page).evaluateAll((rows) => rows.map((row) => row.querySelector("td")?.textContent?.trim() ?? ""));
  expect(times.every((time) => /^\d\d:\d\d:\d\d\.\d{3}$/.test(time))).toBe(true);

  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(view(page).getByRole("status")).toHaveText("Not connected");
  await expect(logRows(page).last()).toContainText("Closed: 1000 (normal closure)");
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
});

test("subprotocols are asked for and the one the server chose is logged; a name that is no token is refused with the browser's reason", async ({ page }) => {
  await page.goto("/");
  await address(page).fill(WS);
  await view(page).getByLabel("Subprotocols").fill("chat.v2, json");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(logRows(page).nth(1)).toContainText("Connected. Subprotocol: chat.v2");
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(view(page).getByRole("status")).toHaveText("Not connected");

  await view(page).getByLabel("Subprotocols").fill("not a token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(view(page).getByRole("alert")).toContainText("The browser did not open the connection");
  await expect(view(page).getByRole("status")).toHaveText("Not connected");
});

test("a server that is not there: the log has the close code, and the tab can connect again", async ({ page }) => {
  await page.goto("/");
  await address(page).fill("ws://127.0.0.1:9/nothing");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  // Chromium and Firefox close with 1006. WebKit, for a port it will not connect to, gives an error and no close.
  await expect(logRows(page).last()).toContainText(/Closed: 1006 \(the connection was lost; no close frame arrived\)|Closed: the browser gave no close code\./, { timeout: 15_000 });
  await expect(view(page).getByRole("status")).toHaveText("Not connected");
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
});

test("a variable is replaced in the address and in a message, and a socket stays open in its tab while another tab is used", async ({ page }) => {
  await page.goto("/");
  await address(page).fill(WS);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(view(page).getByRole("status")).toHaveText("Connected");
  await say(page, "before");
  await expect(logRows(page)).toHaveCount(4);

  await page.getByRole("button", { name: "New tab" }).click();
  await expect(view(page)).toHaveCount(0);
  await address(page).fill(`${ECHO}/status/204`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("204", { timeout: 15_000 });

  await page.getByRole("tablist", { name: "Open requests" }).getByRole("tab").nth(0).click();
  await expect(view(page).getByRole("status")).toHaveText("Connected");
  await say(page, "after");
  await expect(logRows(page)).toHaveCount(6);
  expect((await log(page)).slice(2).map(([direction, text]) => `${direction} ${text}`)).toEqual(["Sent before", "Received before", "Sent after", "Received after"]);

  // Closing the tab asks first, and closes the connection.
  await page.getByRole("button", { name: "Close tab" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Close this tab?" });
  await expect(dialog).toContainText("has a WebSocket open");
  await dialog.getByRole("button", { name: "Close tab" }).click();
  await expect(page.getByRole("tablist", { name: "Open requests" }).getByRole("tab")).toHaveCount(1);
});

for (const theme of ["dark", "light"] as const) {
  test(`a WebSocket's view has no critical or serious violation in the ${theme} theme, and is not wider than the window at four widths`, async ({ page }) => {
    test.slow();
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await address(page).fill(WS);
    const scan = async (state: string) => {
      await page.mouse.move(640, 880);
      await settled(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").flatMap((v) => v.nodes.map((node) => `${state}: ${v.id}: ${node.target.join(" ")}`))).toEqual([]);
    };
    await scan("not connected");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(view(page).getByRole("status")).toHaveText("Connected");
    await say(page, `a long message without a place to break: ${"x".repeat(300)}`);
    await view(page).getByLabel("Message").fill("{{$secret.none}}");
    await view(page).getByRole("button", { name: "Send message" }).click();
    await expect(view(page).getByRole("alert")).toContainText("A WebSocket cannot carry a vault secret");
    await expect(logRows(page)).toHaveCount(4);
    await scan("connected, with a log and an error");

    for (const width of [360, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(view(page).getByRole("button", { name: "Send message" })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `at ${width} px` }).toBeLessThanOrEqual(0);
      for (const name of ["Send message", "Clear log", "Disconnect"]) {
        // Polled, like the width: the drawer's change of layout takes a moment.
        await expect.poll(async () => { const box = await page.getByRole("button", { name, exact: true }).boundingBox(); return !!box && box.x >= 0 && box.x + box.width <= width; }, { message: `${name} at ${width} px` }).toBe(true);
      }
    }
  });
}
