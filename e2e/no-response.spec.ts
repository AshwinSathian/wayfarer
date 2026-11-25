import { test, expect } from "@playwright/test";
import { send } from "./support/app";
import { ECHO } from "./support/echo";

// U-051 (D4-e): when no response arrives, the app says so in its own words and puts nothing in the server's place.
// The browser reports the same words for a refused connection, a name that does not resolve and CORS, so the pane
// says what it cannot tell; its record quotes what the browser reported and offers the Local Bridge, which can tell.

const BROWSER_SAYS: Record<string, RegExp> = {
  chromium: /^Failed to fetch$/,
  firefox: /^NetworkError when attempting to fetch resource\.$/,
  webkit: /^Load failed$/,
};

test("a refused connection: No response, the failure panel's words, the browser's own behind Details, and the Local Bridge set up", async ({
  page,
  browserName,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill("http://127.0.0.1:9/nothing-listens");
  await send(page);
  const status = page.locator(".response-status");
  await expect(status).toContainText("No response");
  await expect(status).not.toContainText("Unknown Error");
  await expect(page.locator(".status-badge")).toHaveCount(0);
  const panel = page.getByRole("region", { name: "Why there was no response" });
  await expect(panel.locator(".failure-headline")).toHaveText("No response from 127.0.0.1:9.");
  await expect(panel.locator(".failure-cause")).toHaveText(
    "The browser does not say why. The name may not resolve, the server may have refused the connection, or it does not allow requests from this page.",
  );
  // One next action: no bridge is paired in a new browser, so it is to start one (bridge-setup.spec.ts).
  await expect(panel.locator(".failure-next")).toHaveText("Start the Local Bridge to see the real reason:");
  await expect(panel.locator(".bridge-command")).toHaveText("npx wayfarer-bridge");
  // What the browser reported is behind Details.
  await expect(panel.locator(".failure-reported")).toHaveCount(0);
  await panel.getByRole("button", { name: "Details" }).click();
  await expect(panel.locator(".failure-reported")).toContainText("What the browser reported");
  await expect(panel.locator(".failure-reported .font-mono")).toHaveText(BROWSER_SAYS[browserName]);
  // The record holds what the send did, and the failure once: not as a second line.
  const record = page.getByRole("region", { name: "Exchange record" });
  await expect(record.locator(".record-failure")).toHaveCount(0);
  await expect(record.locator(".bridge-command")).toHaveCount(0);
  // Nothing in the server's place: no body in a server's face.
  await expect(page.locator("app-response-viewer pre")).toHaveCount(0);
  // U-175: said once, and no tab of a response that never came: what was sent is there to read (S4b2), and nothing else.
  await expect(page.locator(".response-failure")).toHaveCount(1);
  await expect(record).not.toContainText("No vault secret was filled.");
  await expect(record).not.toContainText("Nothing was masked.");
  await expect(page.locator("app-response-viewer").getByRole("tab")).toHaveText(["Sent"]);
});

test("@claim:C-104 an offline browser is said so, and Send again sends once it is back", async ({ page, context }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/echo?offline=1`);
  await context.setOffline(true);
  await send(page);
  const panel = page.getByRole("region", { name: "Why there was no response" });
  await expect(panel.locator(".failure-headline")).toHaveText("You are offline.");
  await expect(panel.locator(".failure-cause")).toHaveText(
    "This device has no network connection, so nothing was sent.",
  );
  // The live region keeps its first sentence and the route.
  await expect(page.locator(".response-announcement")).toContainText("this browser is offline");
  await context.setOffline(false);
  await panel.getByRole("button", { name: "Send again" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");
});

test("an error status with an empty body says it has no body, and nothing is written in its place", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/empty/404`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("404");
  await expect(page.getByText("The response has no body.")).toBeVisible();
  await expect(page.locator("app-response-viewer")).not.toContainText("Http failure response");
});
