import { test, expect, type Page } from "@playwright/test";
import { send } from "./support/app";
import { ECHO } from "./support/echo";

// P2.14: before a request is sent, the composer says what the browser will
// do to it. The statements are computed by `browserLimits` in @wayfarer/core
// (unit-tested against the Fetch standard's rules); these tests hold them
// against what a real browser put on the wire.

const notes = (page: Page) => page.locator("app-browser-notes");

async function setHeader(page: Page, name: string, value: string): Promise<void> {
  const panel = page.locator("app-headers-panel");
  await panel.getByPlaceholder("name").last().fill(name);
  await panel.getByPlaceholder("value").last().fill(value);
}

async function openPanel(page: Page): Promise<void> {
  await notes(page).getByRole("button", { name: /What the browser does to this request/ }).click();
}

test("@claim:C-049 a Cookie header is shown as dropped, and the browser does drop it", async ({ page }) => {
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await expect(notes(page).locator(".browser-note-dropped")).toHaveCount(0);

  await setHeader(page, "Cookie", "session=abc");
  const dropped = notes(page).locator(".browser-note-dropped");
  await expect(dropped).toContainText("The browser will not send Cookie");

  // What was said is what happened: the server saw no cookie, and saw the headers listed as added.
  await openPanel(page);
  const added = await notes(page).locator(".browser-note-adds code").allTextContents();
  expect(added).toEqual(["Origin", "Sec-Fetch-Dest", "Sec-Fetch-Mode", "Sec-Fetch-Site", "Accept", "Accept-Encoding", "Accept-Language", "User-Agent"]);

  const echoed = page.waitForResponse((response) => response.url() === `${ECHO}/echo` && response.request().method() === "GET");
  await send(page);
  const received = ((await (await echoed).json()) as { headers: [string, string][] }).headers.map(([name]) => name);
  expect(received).not.toContain("cookie");
  expect(received).not.toContain("referer");
  for (const name of added) expect(received, `the browser adds ${name}`).toContain(name.toLowerCase());
});

test.describe("the preflight", () => {
  // Without the app's service worker: with it in control, WebKit sends the request anyway (F64, below).
  test.use({ serviceWorkers: "block" });

  test("says when the browser asks the server first, and why; a server that does not answer that question never gets the request", async ({ page }) => {
    // /cors/simple allows the origin and answers no preflight: a request the browser asks about first fails there.
    await page.goto("/");
    await page.locator("input.address-url").fill(`${ECHO}/cors/simple`);
    await openPanel(page);
    const preflight = notes(page).locator(".browser-note-preflight");
    await expect(preflight).toContainText("sent without asking the server first");
    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");
  
    await setHeader(page, "X-Api-Key", "k");
    await expect(preflight).toContainText("asks the server first");
    await expect(preflight).toContainText("the header X-Api-Key");
    await send(page);
    // No response: the browser gave up after the server's answer to OPTIONS allowed nothing.
    await expect(page.locator(".status-badge")).toHaveText("0");
  });
});

test("F64: with the service worker in control, a request the server's preflight answer refuses is not sent", async ({ page, browserName }) => {
  // A tripwire, as in tripwire.spec.ts: WebKit gets a 200 here (issue #209), so this fails there and goes red if that changes.
  test.fail(browserName === "webkit", "F64 (#209): WebKit sends the request although the preflight was refused");
  await page.goto("/");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const outcome = await page.evaluate(
    (url) =>
      fetch(url, { headers: { "X-Api-Key": "k" }, cache: "no-store" }).then(
        (response) => `answered ${response.status}`,
        () => "refused"
      ),
    `${ECHO}/cors/simple`
  );
  expect(outcome).toBe("refused");
});

test("an http:// address is not called mixed content on a page that is itself http://", async ({ page }) => {
  // The notice for an HTTPS page is a unit test of browserLimits: the e2e origin is http://localhost.
  await page.goto("/");
  await page.locator("input.address-url").fill("http://example.invalid/x");
  await openPanel(page);
  await expect(notes(page).locator(".browser-note-preflight")).toBeVisible();
  await expect(notes(page).locator(".browser-note-mixed")).toHaveCount(0);
});
