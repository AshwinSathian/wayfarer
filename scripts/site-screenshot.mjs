#!/usr/bin/env node
// The site's stills of the app (W2.1 of PLAN-design.md, the landing's pictures since the launch rework): the app as
// built, in Chromium, with a Postman collection imported and its requests sent. Every answer is made up here
// (`page.route`) and every other address is refused, so a still never reaches the network; the app is the real one.
//
// - `app.jpg`: the still the site's structured data names (structured-data.ts).
// - `shots/hero-<theme>.<1x|2x>.avif`: the landing's first picture, a request sent from an imported collection.
// - `shots/import-<theme>.avif`, `shots/review-<theme>.avif`, `shots/run-<theme>.avif`: the Postman move, a step each.
//
// Usage: npm run build && npm run gen:shots   (serves dist/deploy itself on PORT, default 4571; needs ffmpeg with
// libsvtav1 on the PATH, as gen:recordings does)
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { startServer } from "../e2e/support/prod-server.mjs";

const PORT = Number(process.env.PORT ?? 4571);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "packages/site/public";
const API = "https://api.example.com";

const ORDER = {
  id: "ord_8f3k2",
  status: "open",
  sku: "TRAIL-42",
  quantity: 2,
  total: { amount: 5800, currency: "EUR" },
};
/** What api.example.com answers, by method and path. */
const ANSWERS = {
  "GET /v1/orders": [200, [ORDER]],
  "POST /v1/orders": [201, { ...ORDER, customer: { id: 42, name: "Ada Lovelace" }, created: "2026-11-09T09:30:00Z" }],
  "GET /v1/orders/ord_8f3k2": [200, ORDER],
  "DELETE /v1/orders/ord_8f3k2": [204, null],
  "GET /v1/customers/42": [200, { id: 42, name: "Ada Lovelace", email: "ada@example.com" }],
  "GET /v1/health": [200, { status: "ok" }],
};

const test = (name, code) => ({
  listen: "test",
  script: {
    type: "text/javascript",
    exec: [`pm.test(${JSON.stringify(name)}, () => pm.response.to.have.status(${code}));`],
  },
});
/** A Postman v2.1 file, as a reader would bring one. */
const COLLECTION = {
  info: { name: "Storefront API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  variable: [
    { key: "base", value: `${API}/v1` },
    { key: "token", value: "demo-7f3a" },
  ],
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] },
  item: [
    {
      name: "Orders",
      item: [
        { name: "List orders", request: { method: "GET", url: "{{base}}/orders" }, event: [test("lists orders", 200)] },
        {
          name: "Create order",
          request: {
            method: "POST",
            url: "{{base}}/orders",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: '{\n  "sku": "TRAIL-42",\n  "quantity": 2\n}',
              options: { raw: { language: "json" } },
            },
          },
          event: [
            {
              listen: "test",
              script: {
                type: "text/javascript",
                exec: [
                  'pm.test("created", () => pm.response.to.have.status(201));',
                  'pm.collectionVariables.set("orderId", pm.response.json().id);',
                ],
              },
            },
          ],
        },
        {
          name: "Get order",
          request: { method: "GET", url: "{{base}}/orders/{{orderId}}" },
          event: [test("found", 200)],
        },
        {
          name: "Cancel order",
          request: { method: "DELETE", url: "{{base}}/orders/{{orderId}}" },
          event: [test("gone", 204)],
        },
      ],
    },
    {
      name: "Customers",
      item: [
        { name: "Get customer", request: { method: "GET", url: "{{base}}/customers/42" }, event: [test("found", 200)] },
      ],
    },
    { name: "Health", request: { method: "GET", url: "{{base}}/health" }, event: [test("up", 200)] },
  ],
};

/** Answers api.example.com from ANSWERS and refuses every address but the app's own. */
async function cannedNetwork(context) {
  await context.route(
    (url) => url.origin !== BASE,
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== API) return route.abort("blockedbyclient");
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const [status, body] = ANSWERS[`${request.method()} ${url.pathname}`] ?? [404, { error: "not found" }];
      return route.fulfill({
        status,
        headers: { ...headers, "content-type": "application/json" },
        body: body === null ? "" : JSON.stringify(body, null, 2),
      });
    },
  );
}

/** Waits for the faces and for every transition still under way, not for a time. */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
}

/** A PNG of the page as AVIF, the format the landing's posters are (site-record.mjs says why). */
function avif(png, file, crop) {
  execFileSync(
    "ffmpeg",
    [
      ...["-y", "-loglevel", "error", "-i", png, ...(crop ? ["-vf", `crop=${crop}`] : []), "-c:v", "libsvtav1"],
      ...["-crf", "36", "-pix_fmt", "yuv420p", "-frames:v", "1", "-f", "avif", file],
    ],
    { stdio: "pipe" },
  );
  console.log(`site-screenshot: ${file}`);
}

async function shots(browser, theme, scale, work) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale });
  await context.addInitScript((t) => localStorage.setItem("wayfarer:theme", t), theme);
  await cannedNetwork(context);
  const page = await context.newPage();
  const take = async (name, locator = page) => {
    await settle(page);
    const png = join(work, `${name}-${theme}-${scale}.png`);
    await locator.screenshot({ path: png });
    return png;
  };
  await page.goto(`${BASE}/app/`);
  await page.locator('app-collections-sidebar input[type="file"]').setInputFiles({
    name: "storefront.postman_collection.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(COLLECTION)),
  });
  const dialog = page.getByRole("dialog", { name: "Import collection" });
  await dialog.getByText("Its requests go to:").waitFor();
  const importPng = await take("import", dialog);
  await dialog.getByRole("button", { name: "Import and review scripts…" }).click();
  const review = page.getByRole("dialog", { name: "Review scripts" });
  await review.locator(".script-review-code").first().waitFor();
  const reviewPng = await take("review", review);
  await review.getByRole("button", { name: "Trust these scripts" }).click();
  await review.waitFor({ state: "hidden" });

  const tree = page.getByRole("tree");
  const create = tree.getByText("Create order", { exact: true });
  if (!(await create.isVisible())) await tree.getByText("Orders", { exact: true }).click();
  await create.click();
  await page.getByRole("button", { name: "Send request" }).click();
  await page.locator(".status-badge").filter({ hasText: "201" }).waitFor();
  await page.locator("app-response-viewer").getByText("Ada Lovelace").first().waitFor();
  // The tree shows where the request lives.
  if (!(await create.isVisible())) await tree.getByText("Orders", { exact: true }).click();
  await create.waitFor();
  // The import's Undo notice goes by itself; the still waits for it.
  await page.getByText(/^Imported /).waitFor({ state: "hidden", timeout: 15_000 });
  const heroPng = await take("hero");

  await tree.getByText("Storefront API", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Run…" }).click();
  const view = page.locator("app-run-view");
  await view.getByRole("button", { name: "Run", exact: true }).click();
  await view
    .getByRole("status")
    .filter({ hasText: /tests passed/ })
    .waitFor({ timeout: 15_000 });
  const runPng = await take("run", view);
  await context.close();
  return { importPng, reviewPng, heroPng, runPng };
}

const server = startServer("dist/deploy", PORT);
const browser = await chromium.launch();
const work = await mkdtemp(join(tmpdir(), "wayfarer-shots-"));
try {
  for (const theme of ["dark", "light"]) {
    for (const scale of [1, 2]) {
      const taken = await shots(browser, theme, scale, work);
      avif(taken.heroPng, `${OUT}/shots/hero-${theme}.${scale}x.avif`);
      if (scale === 1) continue;
      // A step is drawn about 560 px wide beside its text: each still is the part of its view that says the step, cut
      // where the view's own lines end (a code line runs on, as it does in the editor).
      avif(taken.importPng, `${OUT}/shots/import-${theme}.avif`, "960:720:0:190");
      avif(taken.reviewPng, `${OUT}/shots/review-${theme}.avif`, "1100:825:0:300");
      avif(taken.runPng, `${OUT}/shots/run-${theme}.avif`, "1100:825:0:0");
      if (theme === "dark") {
        execFileSync("ffmpeg", [
          "-y",
          "-loglevel",
          "error",
          "-i",
          taken.heroPng,
          "-vf",
          "scale=1440:-1",
          "-q:v",
          "4",
          `${OUT}/app.jpg`,
        ]);
        console.log(`site-screenshot: ${OUT}/app.jpg`);
      }
    }
  }
} finally {
  await browser.close();
  await rm(work, { recursive: true, force: true });
  server.close();
}
