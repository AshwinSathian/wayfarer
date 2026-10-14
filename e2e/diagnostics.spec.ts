import { expect, test, type Page } from "@playwright/test";
import { openSettings, protectVariable, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// P7.3: Settings → Diagnostics. What is running, self-tests, the errors of
// this page and a report to copy that holds nothing of a request.

async function recordClipboard(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const written: string[] = [];
    (window as unknown as { __clipboard: string[] }).__clipboard = written;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void written.push(text) } });
  });
  return () => page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard);
}

test("@claim:C-068 an IndexedDB that fails to open is named in Diagnostics, and the self-tests say storage is memory only", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException("forced for the test", "UnknownError");
    };
  });
  await page.goto("/");
  const settings = await openSettings(page, "Diagnostics");
  await expect(settings.locator(".diagnostics-errors")).toContainText("IndexedDB: Failed to open IndexedDB");
  await expect(settings.locator(".diagnostics-errors")).toContainText("UnknownError: forced for the test");
  await expect(settings.getByText("none: memory only")).toBeVisible();
  await settings.getByRole("button", { name: "Run self-tests" }).click();
  await expect(settings.locator(".diagnostics-tests li")).toHaveCount(5, { timeout: 20_000 });
  await expect(settings.locator(".diagnostics-tests")).toContainText("IndexedDB failed: this browser gives the app no storage: memory only");
});

test("the self-tests pass in a browser with storage, and the facts name the version and the commit", async ({ page }) => {
  await page.goto("/");
  const settings = await openSettings(page, "Diagnostics");
  await expect(settings.getByText("Commit", { exact: true })).toBeVisible();
  await expect(settings.locator(".diagnostics-fact").nth(1)).toHaveText(/^[0-9a-f]{7,}$/);
  await settings.getByRole("button", { name: "Run self-tests" }).click();
  const tests = settings.locator(".diagnostics-tests li");
  await expect(tests).toHaveCount(5, { timeout: 20_000 });
  for (const name of ["Scripts (QuickJS) passed: 1 + 1 = 2", "Vault crypto passed", "IndexedDB passed", "Same-origin fetch passed: 200", "Local Bridge passed: not used"]) {
    await expect(settings.locator(".diagnostics-tests")).toContainText(name);
  }
});

test("@claim:C-068 the copied report holds no string of a request sent with a vault secret, nor of what came back", async ({ page }) => {
  test.slow();
  const clipboard = await recordClipboard(page);
  const SECRET = "diag-secret-7f3e91c2a4";
  await seedAndOpen(page, {}, {
    method: "POST",
    url: `${ECHO}/echo?token={{API_TOKEN}}&marker=diag-query-5b1`,
    headers: { "X-Api-Key": "{{API_TOKEN}}", "X-Marker": "diag-header-c44" },
    storedBody: { mode: "raw", raw: { language: "text", text: "body-marker-91d {{API_TOKEN}}" } },
    // An error that names what came back: it goes into the log, and must arrive there without it.
    postRequestScript: `throw new Error("failed on " + pm.response.text());`,
  });
  await protectVariable(page, "API_TOKEN", SECRET);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  // A send that fails, with the secret in its address.
  await page.locator("input.address-url").fill(`http://127.0.0.1:9/unreachable?token={{API_TOKEN}}`);
  await send(page);
  await expect(page.locator("app-response-viewer")).toContainText(/network|reach|fail/i, { timeout: 15_000 });

  const settings = await openSettings(page, "Diagnostics");
  await settings.getByRole("button", { name: "Run self-tests" }).click();
  await expect(settings.locator(".diagnostics-tests li")).toHaveCount(5, { timeout: 20_000 });
  await settings.getByRole("button", { name: "Copy report" }).click();
  await expect.poll(clipboard).toHaveLength(1);
  const [report] = await clipboard();
  expect(report).toContain("## Wayfarer diagnostics");
  for (const leak of [SECRET, "diag-query-5b1", "diag-header-c44", "body-marker-91d", "127.0.0.1", "/echo", "/unreachable", "API_TOKEN"]) {
    expect(report, leak).not.toContain(leak);
  }
  // And the issue link carries the same report.
  const href = await settings.getByRole("link", { name: "Open GitHub issue" }).getAttribute("href");
  expect(href).toMatch(/^https:\/\/github\.com\/AshwinSathian\/wayfarer\/issues\/new\?title=/);
  const body = decodeURIComponent(new URL(href ?? "").searchParams.get("body") ?? "");
  for (const leak of [SECRET, "diag-query-5b1", "127.0.0.1"]) expect(body, leak).not.toContain(leak);
});
