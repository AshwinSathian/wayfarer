import { test, expect, type Page, type Request, type Response } from "@playwright/test";

// Phase 0 tripwires (PLAN-airtight-remediation.md, P0.1). One test per P0
// audit finding, each titled with its F-ID. Each was written to fail against
// the audited code and is flipped to passing by the task that fixes it:
// that task deletes the test's `test.fail()` line, so CI stays green
// meanwhile and goes red if a tripwire starts passing unnoticed.
//
// Targets are Playwright-routed fake hosts (no internet, fully
// deterministic): the tests assert on what the browser actually put on the
// wire, not on what a third-party echo service reflected back. F06 is the
// exception; it needs a real DNS failure.
//
// F01 and F06 only mean something against the production build served with
// production headers (e2e/support/prod-server.mjs). Locally, run them with
// `CI=1 npx playwright test e2e/tripwire.spec.ts`.

const TARGET = "https://tripwire.test";

async function expectProdParity(response: Response | null): Promise<void> {
  expect(
    response?.headers()["content-security-policy"],
    "tripwire needs the prod build on prod-server.mjs; run with CI=1"
  ).toContain("script-src 'self'");
}

/** Routes TARGET to a CORS-permissive fake and records every non-preflight request that reaches it. */
async function captureTarget(
  page: Page,
  reply: { contentType: string; body: string | Buffer } = {
    contentType: "application/json",
    body: '{"ok":true}',
  }
): Promise<Request[]> {
  const hits: Request[] = [];
  await page.route(`${TARGET}/**`, async (route) => {
    const request = route.request();
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "*",
      "access-control-allow-headers": request.headers()["access-control-request-headers"] ?? "*",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    hits.push(request);
    await route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": reply.contentType },
      body: reply.body,
    });
  });
  return hits;
}

interface SeededRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  auth?: unknown;
  postRequestScript?: string;
}

/**
 * Writes an active environment and a one-request collection straight into
 * IndexedDB (after the app has created and migrated the database), reloads,
 * and opens the request in the composer. Seeding avoids driving Monaco for
 * scripts and nested JSON bodies.
 */
async function seedAndOpen(
  page: Page,
  vars: Record<string, string>,
  request: SeededRequest
): Promise<Response | null> {
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.waitForFunction(async () =>
    (await indexedDB.databases()).some((db) => db.name === "api-sandbox" && (db.version ?? 0) >= 4)
  );
  await page.evaluate(
    async ({ vars, request }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("api-sandbox");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const read = db.transaction("meta").objectStore("meta").get("state");
      const state = await new Promise((resolve) => (read.onsuccess = () => resolve(read.result)));
      const now = Date.now();
      const meta = (id: string) => ({ id, createdAt: now, updatedAt: now, version: 1 });
      const tx = db.transaction(["environments", "collections", "requests", "meta"], "readwrite");
      tx.objectStore("environments").put({ id: "env-tw", meta: meta("env-tw"), name: "Tripwire env", vars, order: 0 });
      tx.objectStore("meta").put({ schemaVersion: 1, ...(state ?? {}), key: "state", activeEnvironmentId: "env-tw" });
      tx.objectStore("collections").put({ id: "col-tw", meta: meta("col-tw"), name: "Tripwire collection", order: 0 });
      tx.objectStore("requests").put({
        id: "req-tw",
        meta: meta("req-tw"),
        collectionId: "col-tw",
        name: "Tripwire request",
        order: 0,
        headers: {},
        ...request,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { vars, request }
  );
  const response = await page.reload();
  await page.getByText("Tripwire request", { exact: true }).dblclick();
  await expect(page.locator("input.address-url")).toHaveValue(request.url);
  return response;
}

async function send(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Send request" }).click();
}

test.describe("Phase 0 tripwires", () => {
  // Routed targets must not be shadowed by the app's service worker; F06
  // (below) is the one tripwire that needs the worker.
  test.use({ serviceWorkers: "block" });

  test("F01: a script under production CSP either runs or shows the disabled banner, never fails silently", async ({ page }) => {
    await captureTarget(page);
    const response = await seedAndOpen(page, {}, {
      method: "GET",
      url: `${TARGET}/f01`,
      postRequestScript: 'pm.test("tripwire F01 script ran", function () { pm.expect(1).to.equal(1); });',
    });
    await expectProdParity(response);

    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");

    await page.getByRole("tab", { name: "Scripts" }).click();
    await page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ }).click();
    const ran = page.locator(".test-result-pass", { hasText: "tripwire F01 script ran" });
    const banner = page.getByText(/Scripts are temporarily disabled/);
    await expect(ran.or(banner).first()).toBeVisible();
  });

  test("F03: a protected-variable placeholder is never sent on the wire", async ({ page }) => {
    const hits = await captureTarget(page);
    // Scan every request to any host, not only the routed target.
    const leaks: string[] = [];
    page.on("request", (request) => {
      const wire = [request.url(), JSON.stringify(request.headers()), request.postData() ?? ""].join("\n");
      if (/\{\{\s*\$secret\./.test(wire)) leaks.push(request.url());
    });
    await seedAndOpen(page, { apiKey: "{{$secret.00000000-0000-4000-8000-0000000000f3}}" }, {
      method: "GET",
      url: `${TARGET}/f03`,
      headers: { "X-Api-Key": "{{apiKey}}" },
    });

    await send(page);

    await expect(page.getByText(/Protected variables are not yet applied to requests/)).toBeVisible();
    // A fix that shows the error but still sends in the background must fail:
    // give any in-flight send time to reach the wire before asserting.
    await page.waitForTimeout(1_000);
    expect(hits).toHaveLength(0);
    expect(leaks).toEqual([]);
  });

  for (const [contentType, body] of [
    ["text/html; charset=utf-8", "<h1>tripwire F04 html</h1>"],
    ["application/xml", "<tripwire>F04 xml</tripwire>"],
    ["text/plain; charset=utf-8", "tripwire F04 plain text"],
  ]) {
    test(`F04: a ${contentType.split(";")[0]} response renders as text, not the HttpClient parse-error wrapper`, async ({ page }) => {
      test.fail(true, "open until P0.4 lands");
      await captureTarget(page, { contentType, body });
      await page.goto("/");
      await page.locator("input.address-url").fill(`${TARGET}/f04`);
      await send(page);

      await expect(page.locator(".status-badge")).toHaveText("200");
      // The viewer soft-wraps lines, so compare with whitespace removed.
      const viewerText = async () =>
        ((await page.locator("app-response-viewer").textContent()) ?? "").replace(/\s+/g, "");
      await expect.poll(viewerText).toContain(body.replace(/\s+/g, ""));
      expect(await viewerText()).not.toContain('"error":');
      expect(await viewerText()).not.toContain('"text":');
    });
  }

  test("F07: {{vars}} in the Auth tab are resolved before sending", async ({ page }) => {
    test.fail(true, "open until P0.6 lands");
    const hits = await captureTarget(page);
    await seedAndOpen(page, { token: "f07-token-value" }, {
      method: "GET",
      url: `${TARGET}/f07`,
      auth: { type: "bearer", bearer: { token: "{{token}}" } },
    });

    await send(page);

    await expect.poll(() => hits.length).toBe(1);
    expect(hits[0].headers()["authorization"]).toBe("Bearer f07-token-value");
  });

  test("F08: {{vars}} nested in a JSON body (objects and arrays) are resolved before sending", async ({ page }) => {
    test.fail(true, "open until P0.6 lands");
    const hits = await captureTarget(page);
    await seedAndOpen(page, { token: "f08-value" }, {
      method: "POST",
      url: `${TARGET}/f08`,
      headers: { "Content-Type": "application/json" },
      body: { outer: { inner: "{{token}}", list: ["{{token}}", { deep: "{{token}}" }] } },
    });

    await send(page);

    await expect.poll(() => hits.length).toBe(1);
    expect(hits[0].postDataJSON()).toEqual({
      outer: { inner: "f08-value", list: ["f08-value", { deep: "f08-value" }] },
    });
  });
});

test.describe("Phase 0 tripwires (service worker active)", () => {
  test("F06: a DNS failure shows a network error, not a synthetic 504", async ({ page }) => {
    test.fail(true, "open until P0.5 lands");
    const response = await page.goto("/");
    await expectProdParity(response);
    // Let the production service worker (if any) install and take control,
    // as it has for any returning user, then load the app under it.
    await page.evaluate(() =>
      Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(resolve, 35_000)),
      ])
    );
    await page.reload();

    await page.locator("input.address-url").fill("https://tripwire-f06.invalid/");
    await send(page);

    await expect(page.getByText(/Network error/).first()).toBeVisible();
    await expect(page.locator(".status-badge")).not.toHaveText("504");
  });
});
