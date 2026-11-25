import { expect, test, type Page } from "@playwright/test";
import { send } from "./support/app";
import { routeThroughBridge, startBridge, type TestBridge } from "./support/bridge";
import { ECHO } from "./support/echo";

// S4b3: a send that got no response is said once, in a panel: what happened, why as far as the page can tell, and the
// one thing to do. One test for each class the page and the Local Bridge can tell apart; what the browser or the bridge
// reported is behind Details. (Offline and the browser's own unreachable are in no-response.spec.ts, an untrusted
// certificate is in bridge.spec.ts.)

const panel = (page: Page) => page.getByRole("region", { name: "Why there was no response" });
const address = (page: Page) => page.locator("input.address-url");

/** A bridge address nothing listens at, with the token a bridge would be given. */
const absent: TestBridge = {
  url: "http://127.0.0.1:7799",
  token: "bridge-token-for-an-e2e-0123456789abcdef",
  pairingCode: "",
  stop: () => undefined,
};

test("@claim:C-104 a request that outlasts the timeout says how long it waited and offers the timeout setting", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("wayfarer:request-timeout-ms", "500"));
  await page.goto("/app/");
  await address(page).fill(`${ECHO}/delay/5000`);
  await send(page);
  await expect(panel(page).locator(".failure-headline")).toHaveText(/^No answer in \d+ ms\.$/);
  await expect(panel(page).locator(".failure-cause")).toHaveText("127.0.0.1:4300 did not respond before the timeout.");
  // One action: it opens the setting that decides it.
  await expect(panel(page).getByRole("button")).toHaveText(["Raise the timeout", "Details"]);
  await panel(page).getByRole("button", { name: "Raise the timeout" }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings.getByLabel("Request timeout")).toBeVisible();
});

test("@claim:C-104 a request you stop says so, and Send again sends it", async ({ page }) => {
  await page.goto("/app/");
  await address(page).fill(`${ECHO}/delay/4000`);
  await send(page);
  await page.getByRole("button", { name: "Stop request" }).click();
  await expect(panel(page).locator(".failure-headline")).toHaveText("Stopped.");
  await expect(panel(page).locator(".failure-cause")).toContainText("You stopped this request.");
  await address(page).fill(`${ECHO}/echo`);
  await panel(page).getByRole("button", { name: "Send again" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");
});

test("@claim:C-104 a Local Bridge that does not answer says it may not be running and opens its settings", async ({
  page,
}) => {
  await page.goto("/app/");
  await routeThroughBridge(page, absent);
  await address(page).fill(`${ECHO}/echo`);
  await send(page);
  await expect(panel(page).locator(".failure-headline")).toHaveText("The Local Bridge did not answer.");
  await panel(page).getByRole("button", { name: "Open Local Bridge settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings.getByRole("heading", { name: "Local Bridge", exact: true })).toBeVisible();
});

test("@claim:C-104 a token the Local Bridge does not accept says so and opens its settings", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await page.goto("/app/");
    await routeThroughBridge(page, { ...bridge, token: "another-token-for-an-e2e-0123456789abcdef" });
    await address(page).fill(`${ECHO}/echo`);
    await send(page);
    await expect(panel(page).locator(".failure-headline")).toHaveText("The Local Bridge did not accept the token.", {
      timeout: 15_000,
    });
    await panel(page).getByRole("button", { name: "Details" }).click();
    await expect(panel(page).locator(".failure-reported")).toContainText("What the bridge reported");
    await expect(panel(page).getByRole("button", { name: "Open Local Bridge settings" })).toBeVisible();
  } finally {
    bridge.stop();
  }
});

test("@claim:C-104 a connection the server refuses, seen through the Local Bridge, names the host and the cause", async ({
  page,
}) => {
  const bridge = await startBridge();
  try {
    await page.goto("/app/");
    await routeThroughBridge(page, bridge);
    await address(page).fill("http://127.0.0.1:9/nothing-listens");
    await send(page);
    await expect(panel(page).locator(".failure-headline")).toHaveText("127.0.0.1:9 refused the connection.", {
      timeout: 15_000,
    });
    await expect(panel(page).locator(".failure-cause")).toHaveText(
      "Nothing is listening at that address, or a firewall blocked it.",
    );
    await expect(panel(page).getByRole("button", { name: "Send again" })).toBeVisible();
    await panel(page).getByRole("button", { name: "Details" }).click();
    await expect(panel(page).locator(".failure-reported .font-mono")).toContainText("ECONNREFUSED");
  } finally {
    bridge.stop();
  }
});

test("@claim:C-104 a name that does not resolve, seen through the Local Bridge, says so", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await page.goto("/app/");
    await routeThroughBridge(page, bridge);
    await address(page).fill("http://no-such-host.invalid/");
    await send(page);
    await expect(panel(page).locator(".failure-headline")).toHaveText("Could not find no-such-host.invalid.", {
      timeout: 15_000,
    });
    await expect(panel(page).locator(".failure-cause")).toHaveText("The name does not resolve from this computer.");
  } finally {
    bridge.stop();
  }
});
