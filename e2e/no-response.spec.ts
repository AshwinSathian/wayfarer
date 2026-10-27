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

test("a refused connection: No response, the app's words, the browser's own, and the Local Bridge offered", async ({
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
  const failure = page.locator(".response-failure");
  await expect(failure).toContainText(
    "The request got no response. The browser does not say why: the name may not resolve, the server may have refused the connection, or it does not allow requests from this page (CORS). Send it through the Local Bridge to see which.",
  );
  // What the browser reported and the action are in the exchange record, open after a failure (D4.12). No bridge
  // is paired in a new browser: the action is to set one up (bridge-setup.spec.ts).
  const record = page.getByRole("region", { name: "Exchange record" });
  await expect(record.locator(".record-failure .font-mono")).toHaveText(BROWSER_SAYS[browserName]);
  await expect(record.locator(".bridge-command")).toHaveText("npx wayfarer-bridge");
  // Nothing in the server's place: no body in a server's face.
  await expect(page.locator("app-response-viewer pre")).toHaveCount(0);
});

test("an offline browser is said so", async ({ page, context }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/echo?offline=1`);
  await context.setOffline(true);
  await send(page);
  await expect(page.locator(".response-failure")).toContainText(
    "The request got no response: this browser is offline. Connect, then send it again.",
  );
  await context.setOffline(false);
});

test("an error status with an empty body says No body returned, and nothing is written in its place", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/empty/404`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("404");
  await expect(page.getByText("No body returned.")).toBeVisible();
  await expect(page.locator("app-response-viewer")).not.toContainText("Http failure response");
});
