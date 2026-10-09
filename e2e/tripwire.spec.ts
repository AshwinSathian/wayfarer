import { test, expect } from "@playwright/test";
import { TARGET, captureTarget, expectProdParity, seedAndOpen, send } from "./support/app";
import { still } from "./support/settled";

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

test.describe("Phase 0 tripwires", () => {
  // Routed targets must not be shadowed by the app's service worker; F06
  // (below) is the one tripwire that needs the worker.
  test.use({ serviceWorkers: "block" });

  test("F01 @claim:C-006: a script under production CSP either runs or shows the disabled banner, never fails silently", async ({ page }) => {
    await captureTarget(page);
    const response = await seedAndOpen(page, {}, {
      method: "GET",
      url: `${TARGET}/f01`,
      postRequestScript: 'pm.test("tripwire F01 script ran", function () { pm.expect(1).to.equal(1); });',
    });
    await expectProdParity(response);

    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");

    const scriptsTab = page.getByRole("tab", { name: "Scripts" });
    await still(scriptsTab);
    await scriptsTab.click();
    await page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ }).click();
    const ran = page.locator(".test-result-pass", { hasText: "tripwire F01 script ran" });
    const banner = page.getByText(/Scripts are temporarily disabled/);
    await expect(ran.or(banner).first()).toBeVisible();
  });

  test("F03 @claim:C-007: a protected-variable placeholder is never sent on the wire", async ({ page }) => {
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
    test(`F04 @claim:C-009: a ${contentType.split(";")[0]} response renders as text, not the HttpClient parse-error wrapper`, async ({ page }) => {
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

  test("F05 @claim:C-009: an image/png response shows the binary notice and downloads the exact bytes", async ({ page }) => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
    await captureTarget(page, { contentType: "image/png", body: png });
    await page.goto("/");
    await page.locator("input.address-url").fill(`${TARGET}/f05.png`);
    await send(page);

    await expect(page.locator(".status-badge")).toHaveText("200");
    const viewer = page.locator("app-response-viewer");
    await expect(viewer.getByText(`Binary response (${png.length} bytes, image/png)`)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      viewer.getByRole("button", { name: "Download" }).click(),
    ]);
    const saved = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of saved) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(png);
  });

  test("F07: {{vars}} in the Auth tab are resolved before sending", async ({ page }) => {
    const hits = await captureTarget(page);
    await seedAndOpen(page, { token: "f07-token-value" }, {
      method: "GET",
      url: `${TARGET}/f07`,
      auth: { type: "bearer", token: "{{token}}" },
    });

    await send(page);

    await expect.poll(() => hits.length).toBe(1);
    expect(hits[0].headers()["authorization"]).toBe("Bearer f07-token-value");
  });

  test("F08: {{vars}} nested in a JSON body (objects and arrays) are resolved before sending", async ({ page }) => {
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
  test("F06 @claim:C-010: a DNS failure shows a network error, not a synthetic 504, and the old service worker is gone", async ({ page }) => {
    const response = await page.goto("/");
    await expectProdParity(response);
    // Recreate a returning pre-v1.1.0 visitor: a registration for
    // /ngsw-worker.js. On the audited build that URL is the Angular service
    // worker; from v1.1.0 it is the safety worker, which unregisters itself.
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register("/ngsw-worker.js");
      const worker = registration.installing ?? registration.waiting ?? registration.active;
      await new Promise<void>((resolve) => {
        // Firefox never reports "activated" for a worker that unregisters
        // itself while activating; "activating" already means it took over.
        const settled = () => ["activating", "activated", "redundant"].includes(worker?.state ?? "");
        if (!worker || settled()) return resolve();
        worker.addEventListener("statechange", () => settled() && resolve());
        // The safety worker unregisters itself, and a browser may then report
        // no further state (#118). The assertions below do not depend on
        // which state was seen, so stop waiting after 5 s.
        setTimeout(resolve, 5_000);
      });
    });
    await page.reload();

    await page.locator("input.address-url").fill("https://tripwire-f06.invalid/");
    await send(page);

    await expect(page.getByText(/Network error/).first()).toBeVisible();
    await expect(page.locator(".status-badge")).not.toHaveText("504");
    // From v1.2.0 the app registers its own same-origin worker, /sw.js
    // (P1.6); the old Angular worker must be gone.
    // The safety worker unregisters itself asynchronously: on a slow runner
    // it can still be listed for a moment after the reload (#118). It must
    // be gone, so wait for that rather than sampling once.
    await expect
      .poll(async () =>
        (
          await page.evaluate(async () =>
            (await navigator.serviceWorker.getRegistrations()).map((r) => (r.active ?? r.waiting ?? r.installing)?.scriptURL ?? "")
          )
        ).filter((url) => url.endsWith("/ngsw-worker.js"))
      )
      .toEqual([]);
  });
});

test.describe("Tripwires found by the Phase 1 rails", () => {
  test.use({ serviceWorkers: "block" });

  test("F43: a query typed in the URL is sent once, not duplicated by the mirrored Params rows", async ({ page }) => {
    const hits = await captureTarget(page);
    await page.goto("/");
    await page.locator("input.address-url").fill(`${TARGET}/f43?a=1&b=two`);
    await send(page);
    await expect.poll(() => hits.length).toBe(1);
    expect(new URL(hits[0].url()).search).toBe("?a=1&b=two");
  });
});

