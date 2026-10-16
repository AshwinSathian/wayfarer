import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { relative } from "node:path";
import { axe } from "./support/axe";

// W1 (PLAN-design.md): the site is at /, the app at /app/, on one origin.
// The site is in the production build only (`npm run build` writes
// dist/deploy); `ng serve` has the app alone. Run with CI=1.
const DEPLOY = "dist/deploy";
test.skip(!process.env["CI"] && !process.env["BASE_URL"], "the site is in the production build; run with CI=1");

/** Each page of the site: every .html file of the build that is not the app's. */
function sitePages(): string[] {
  return readdirSync(DEPLOY, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => `/${relative(DEPLOY, `${entry.parentPath}/${entry.name}`).split("\\").join("/")}`)
    .filter((path) => !path.startsWith("/app/"))
    .map((path) => path.replace(/(^|\/)index\.html$/, "$1"));
}

test("the site is at / and opens the app, which is at /app/", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("app-root")).toHaveCount(0);
  await page.getByRole("link", { name: "Open Wayfarer" }).first().click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.locator("input.address-url")).toBeVisible();
});

test("/app without its slash goes to /app/", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.locator("input.address-url")).toBeVisible();
});

test("a page that does not exist is a 404 with the site's page, not the app", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.locator("app-root")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open Wayfarer" })).toBeVisible();
});

// W1.2: the site's ground rules. No request leaves the origin and no cookie is set.
test("every page of the site loads only from its own origin and sets no cookie", async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:4200").origin;
  const pages = sitePages();
  expect(pages).toContain("/");
  const foreign: string[] = [];
  const cookies: string[] = [];
  const violations: string[] = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && url.origin !== origin) foreign.push(url.href);
  });
  context.on("response", async (response) => {
    const header = await response.headerValue("set-cookie");
    if (header) cookies.push(`${response.url()}: ${header}`);
  });
  page.on("console", (message) => {
    if (/Content.Security.Policy|Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  for (const path of pages) {
    await page.goto(path);
    expect(await page.evaluate(() => document.cookie), path).toBe("");
  }
  expect(foreign).toEqual([]);
  expect(cookies).toEqual([]);
  expect(violations).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

// Storage belongs to the origin, not the path: what the app stored before the
// move to /app/ is there after it.
test("the site at / and the app at /app/ share the origin's storage", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("wayfarer:theme", "light"));
  await page.goto("/app/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.goto("/");
  const databases = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  expect(databases).toContain("api-sandbox");
});

// W2.1: every sentence of the landing that says what Wayfarer does names its claim, and every ID it names is a
// row of the ledger: a claim the ledger drops cannot stay on the page.
test("each claim the landing names is a row of the claims ledger", async ({ page }) => {
  const ledger = new Set([...readFileSync("docs/claims.md", "utf8").matchAll(/^\| (C-\d{3}) \|/gm)].map((match) => match[1]));
  expect(ledger.size).toBeGreaterThan(60);
  await page.goto("/");
  const named = (await page.locator("[data-claims]").evaluateAll((spans) => spans.map((span) => span.getAttribute("data-claims") ?? ""))).flatMap((ids) => ids.split(" "));
  expect(named.length).toBeGreaterThan(10);
  expect(named.filter((id) => !ledger.has(id))).toEqual([]);
});

for (const width of [360, 390, 820, 1440]) {
  test(`the site's pages are not wider than a ${width} px window, and have no axe violation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of sitePages()) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
      expect((await axe(page).analyze()).violations.map((v) => `${path}: ${v.id}`)).toEqual([]);
    }
  });
}
