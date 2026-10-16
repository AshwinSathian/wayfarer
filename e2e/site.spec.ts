import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

// One test a page: with the docs, one test of every page passed 30 s on CI's Firefox (#350).
for (const path of existsSync(DEPLOY) ? sitePages() : ["/"]) {
  test(`${path} is not wider than a window of 360, 390, 820 or 1,440 px, and has no axe violation`, async ({ page }) => {
    for (const width of [360, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${path} at ${width} px`).toBeLessThanOrEqual(0);
      expect((await axe(page).analyze()).violations.map((v) => `${path} at ${width} px: ${v.id}`)).toEqual([]);
    }
  });
}

// W2.2: every file of docs/ is a page, and the search, the site's one script, finds them.
test("every doc of the repository is a page of the site, its links leading to pages", async ({ page }) => {
  const docs = readdirSync("docs", { recursive: true }).map(String).filter((name) => name.endsWith(".md")).map((name) => name.split("\\").join("/").slice(0, -3));
  expect(docs.length).toBeGreaterThan(15);
  for (const doc of docs) {
    const response = await page.goto(`/docs/${doc}/`);
    expect(response?.status(), doc).toBe(200);
    await expect(page.locator("article h1").first(), doc).toBeVisible();
    // A link to another doc goes to its page, never to its Markdown file.
    expect(await page.locator('article a[href$=".md"]:not([href^="https://"])').count(), doc).toBe(0);
  }
});

test("the docs' search finds a doc by a word in it, from the site's own files", async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:4200").origin;
  const foreign: string[] = [];
  context.on("request", (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith("data:")) foreign.push(request.url());
  });
  await page.goto("/docs/");
  const search = page.getByRole("search", { name: "Search this site" });
  await search.getByRole("textbox", { name: "Search" }).fill("passphrase");
  await expect(page.locator('#search a[href^="/docs/secrets/"]').first()).toBeVisible();
  expect(foreign).toEqual([]);
});

test("/docs/ has the docs' policy, with script from the site's own files, and / still has none", async ({ request }) => {
  const docs = (await request.get("/docs/")).headers()["content-security-policy"] ?? "";
  expect(docs.split(";").map((d) => d.trim())).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(docs).not.toContain(", ");
  expect((await request.get("/")).headers()["content-security-policy"]).not.toContain("script-src");
});
