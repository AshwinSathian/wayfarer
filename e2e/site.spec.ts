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
  expect(databases).toContain("wayfarer");
});

// W2.1: every sentence of the landing that says what Wayfarer does names its claim, and every ID it names is a
// row of the ledger: a claim the ledger drops cannot stay on the page.
test("each claim the landing names is a row of the claims ledger", async ({ page }) => {
  const ledger = new Set(
    [...readFileSync("docs/claims.md", "utf8").matchAll(/^\| (C-\d{3}) \|/gm)].map((match) => match[1]),
  );
  expect(ledger.size).toBeGreaterThan(60);
  await page.goto("/");
  const named = (
    await page
      .locator("[data-claims]")
      .evaluateAll((spans) => spans.map((span) => span.getAttribute("data-claims") ?? ""))
  ).flatMap((ids) => ids.split(" "));
  expect(named.length).toBeGreaterThan(10);
  expect(named.filter((id) => !ledger.has(id))).toEqual([]);
});

// W5.5: "What changed in 3.0" and its post show each picture with its text, at its size, in the page's theme only,
// and name only claims of the ledger. Which findings it shows is scripts/whats-new.test.mjs's.
test("What changed in 3.0 and its post show their pictures with alt text and name only claims of the ledger", async ({
  page,
}) => {
  const ledger = new Set([...readFileSync("docs/claims.md", "utf8").matchAll(/^\| (C-\d{3}) \|/gm)].map((m) => m[1]));
  for (const path of ["/what-changed-in-3-0/", "/blog/the-3-0-redesign/"]) {
    await page.goto(path);
    const images = page.locator("main img");
    expect(await images.count(), path).toBeGreaterThan(3);
    for (const img of await images.all()) {
      expect((await img.getAttribute("alt"))?.length ?? 0, path).toBeGreaterThan(20);
      expect(await img.getAttribute("src"), path).toMatch(/^\/whats-new\/[\w-]+\.jpg$/);
      expect(Number(await img.getAttribute("width")), path).toBeGreaterThan(0);
    }
    const named = (
      await page.locator("[data-claims]").evaluateAll((spans) => spans.map((s) => s.getAttribute("data-claims") ?? ""))
    ).flatMap((ids) => ids.split(" "));
    expect(named.length, path).toBeGreaterThan(0);
    expect(named.filter((id) => !ledger.has(id))).toEqual([]);
  }
  // One theme's pair of the response is drawn, not both.
  await page.goto("/what-changed-in-3-0/");
  await expect(
    page.locator("#response ~ div .shot-light, #response ~ div .shot-dark").filter({ visible: true }),
  ).toHaveCount(1);
});

// W2.5: the blog's posts are pages, newest first, and its RSS feed lists each with its address and date.
test("the blog lists its posts, each a page, and its RSS feed has an item for each", async ({ page, request }) => {
  const files = readdirSync("packages/site/content/blog").filter((name) => name.endsWith(".md"));
  expect(files.length).toBeGreaterThanOrEqual(2);
  await page.goto("/blog/");
  const links = page.locator("main li h2 a");
  await expect(links).toHaveCount(files.length);
  const dates = await page
    .locator("main li time")
    .evaluateAll((times) => times.map((time) => time.getAttribute("datetime") ?? ""));
  expect(dates).toEqual([...dates].sort().reverse());
  const feed = await request.get("/blog/rss.xml");
  expect(feed.status()).toBe(200);
  const xml = await feed.text();
  expect(xml.match(/<item>/g)?.length).toBe(files.length);
  for (const href of await links.evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href") ?? ""))) {
    expect(xml).toContain(`<link>https://wayfarer.ashwinsathian.com${href}</link>`);
    const response = await page.goto(href);
    expect(response?.status(), href).toBe(200);
    await expect(page.locator("article"), href).not.toBeEmpty();
  }
  await page.goto("/");
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute(
    "href",
    "https://wayfarer.ashwinsathian.com/blog/rss.xml",
  );
});

// W2.3: every fact about another product on the comparison pages names its source and the date it was read, every
// claim they name is a row of the ledger, and the index lists where Wayfarer is behind.
test("each comparison page cites a source with its date for every fact about a rival, and names only claims of the ledger", async ({
  page,
}) => {
  const ledger = new Set(
    [...readFileSync("docs/claims.md", "utf8").matchAll(/^\| (C-\d{3}) \|/gm)].map((match) => match[1]),
  );
  const pages = sitePages().filter((path) => path.startsWith("/compare/"));
  expect(pages.length).toBeGreaterThanOrEqual(7);
  for (const path of pages) {
    await page.goto(path);
    for (const cite of await page.locator(".cite").all()) {
      await expect(cite.getByRole("link"), path).toHaveAttribute("href", /^https:\/\//);
      await expect(cite.locator("time"), path).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}$/);
    }
    const named = (
      await page
        .locator("[data-claims]")
        .evaluateAll((spans) => spans.map((span) => span.getAttribute("data-claims") ?? ""))
    ).flatMap((ids) => ids.split(" "));
    expect(
      named.filter((id) => !ledger.has(id)),
      path,
    ).toEqual([]);
  }
  for (const rival of ["postman", "bruno", "yaak", "hoppscotch", "insomnia"]) {
    await page.goto(`/compare/${rival}/`);
    // Each fact and each "ahead" line is an item with its citation.
    for (const list of ["facts", "ahead"]) {
      const items = page.locator(`#${list} + ul > li`);
      expect(await items.count(), `${rival} ${list}`).toBeGreaterThan(0);
      for (const item of await items.all()) await expect(item.locator(".cite"), `${rival} ${list}`).toHaveCount(1);
    }
  }
  await page.goto("/compare/");
  await expect(page.getByRole("heading", { name: "Where Wayfarer is behind" })).toBeVisible();
  expect(await page.locator("#behind + ul > li").count()).toBeGreaterThanOrEqual(4);
});

// D5-e: a sentence about Wayfarer on the comparison pages names its claim, or, for a fact about the project (its
// licence, its first release), cites the file that says so. "How Wayfarer differs", "Where Wayfarer is behind" and
// the steps of Moving from Postman each said something no claim held (the licence, the protocols).
test("every sentence about Wayfarer on the comparison pages names a claim or cites a source", async ({ page }) => {
  const lists: [string, string][] = [
    ...["postman", "bruno", "yaak", "hoppscotch", "insomnia"].map((rival): [string, string] => [
      `/compare/${rival}/`,
      "#differs + ul > li",
    ]),
    ["/compare/", "#behind + ul > li"],
    ["/compare/moving-from-postman/", "main ol > li"],
  ];
  for (const [path, selector] of lists) {
    await page.goto(path);
    const items = page.locator(selector);
    expect(await items.count(), path).toBeGreaterThan(2);
    for (const item of await items.all())
      expect(
        await item.locator("[data-claims], .cite").count(),
        `${path}: ${await item.textContent()}`,
      ).toBeGreaterThan(0);
  }
});

// D5-e: a claim's chip leads to its own row of the ledger, and says what the claim is.
test("a claim's chip links to its row of the ledger and is named by the claim", async ({ page }) => {
  await page.goto("/compare/postman/");
  const chip = page.locator("[data-claims] a", { hasText: "C-058" }).first();
  await expect(chip).toHaveAttribute("href", "/docs/claims/#C-058");
  await expect(chip).toHaveAccessibleName(/^Claim C-058: Postman Collection v2\.0 and v2\.1 files/);
  await chip.click();
  await expect(page).toHaveURL(/\/docs\/claims\/#C-058$/);
  await expect(page.locator("tr#C-058 td").first()).toHaveText("C-058");
});

// D5-e: the design records are working notes, not user docs. They are pages, but search engines are told not to
// list them (except the three the comparison pages rest on), and llms.txt does not offer them as docs: an assistant
// read "designed, not built" flows as features.
test("the design records are noindex and outside llms.txt's docs, and llms-full.txt holds the user docs", async ({
  page,
  request,
}) => {
  for (const [path, noindex] of [
    ["/docs/design/teams/README/", true],
    ["/docs/design/audit/", true],
    ["/docs/runbook/", true],
    ["/docs/design/benchmark/", false],
    ["/docs/auth/", false],
  ] as const) {
    await page.goto(path);
    const robots = page.locator('meta[name="robots"]');
    if (noindex) await expect(robots, path).toHaveAttribute("content", /noindex/);
    else await expect(robots, path).toHaveCount(0);
  }
  await page.goto("/docs/design/teams/README/");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /^Design record, not user documentation\. Status: designed, not built/,
  );
  await page.goto("/docs/");
  await expect(page.getByRole("heading", { name: "Design records" })).toBeVisible();

  const llms = await (await request.get("/llms.txt")).text();
  const docsSection = llms.slice(llms.indexOf("## Docs"), llms.indexOf("## Compare"));
  expect(docsSection).toContain("/docs/auth/");
  expect(docsSection).not.toContain("/docs/design/");
  expect(llms).toContain("## What it does not do");
  const ledger = new Set([...readFileSync("docs/claims.md", "utf8").matchAll(/^\| (C-\d{3}) \|/gm)].map((m) => m[1]));
  const named = [...llms.matchAll(/C-\d{3}/g)].map((m) => m[0]);
  expect(named.length).toBeGreaterThan(10);
  expect(named.filter((id) => !ledger.has(id))).toEqual([]);

  const full = await request.get("/llms-full.txt");
  expect(full.status()).toBe(200);
  const text = await full.text();
  expect(text).toContain("# Secrets vault");
  expect(text).not.toContain("# Team flows");
});

// W3.1: every page names its canonical address, its Open Graph and Twitter cards and an image of its own, which is a
// 1200 by 630 PNG; the sitemap lists every page but the working notes, which say noindex (D5-e); robots.txt names the
// sitemap; the front page describes the app as schema.org data; /llms.txt says what the site is.
test("every page has its canonical address, its cards and its own image, and the sitemap, robots.txt, the app's data and llms.txt are there", async ({
  page,
  request,
}) => {
  const SITE = "https://wayfarer.ashwinsathian.com";
  const pages = sitePages().filter((path) => !/^\/(404|_not-found)/.test(path));
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const images = new Set<string>();
  for (const path of pages) {
    await page.goto(path);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical, path).toBe(`${SITE}${path}`);
    // Only a noindex page has the tag: read it without waiting for one.
    const robots = await page.evaluate(
      () => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "",
    );
    if (robots.includes("noindex")) expect(sitemap, path).not.toContain(`<loc>${SITE}${path}</loc>`);
    else expect(sitemap, path).toContain(`<loc>${SITE}${path}</loc>`);
    const og = async (name: string) => page.locator(`meta[property="og:${name}"]`).getAttribute("content");
    expect(await og("title"), path).toBe(await page.title());
    expect(await og("description"), path).toBe(await page.locator('meta[name="description"]').getAttribute("content"));
    expect(await og("url"), path).toBe(`${SITE}${path}`);
    expect(await page.locator('meta[name="twitter:card"]').getAttribute("content"), path).toBe("summary_large_image");
    const image = (await og("image")) ?? "";
    expect(image.startsWith(`${SITE}/og/`), path).toBe(true);
    images.add(image);
    const png = await request.get(image.slice(SITE.length));
    expect(png.status(), image).toBe(200);
    const bytes = await png.body();
    // A PNG's signature, then its width and height in the IHDR chunk.
    expect(bytes.subarray(1, 4).toString("latin1"), image).toBe("PNG");
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], image).toEqual([1200, 630]);
  }
  expect(images.size).toBe(pages.length);

  expect(await (await request.get("/robots.txt")).text()).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  await page.goto("/");
  const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}") as {
    "@context": string;
    "@graph": Record<string, unknown>[];
  };
  expect(data["@context"]).toBe("https://schema.org");
  const app = data["@graph"].find((node) => node["@type"] === "SoftwareApplication");
  expect(app).toMatchObject({
    name: "Wayfarer",
    alternateName: "Wayfarer API client",
    url: `${SITE}/app/`,
    offers: { "@type": "Offer", price: "0" },
  });
  // Each feature it lists is a row of the ledger, named.
  const ledger = new Set([...readFileSync("docs/claims.md", "utf8").matchAll(/^\| (C-\d{3}) \|/gm)].map((m) => m[1]));
  const features = (app?.["featureList"] ?? []) as string[];
  expect(features.length).toBeGreaterThan(3);
  for (const feature of features) expect(ledger.has(/\((C-\d{3})\)$/.exec(feature)?.[1] ?? ""), feature).toBe(true);
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toMatch(/^# Wayfarer\n\n> /);
});

// One test a page: with the docs, one test of every page passed 30 s on CI's Firefox (#350).
for (const path of existsSync(DEPLOY) ? sitePages() : ["/"]) {
  test(`${path} is not wider than a window of 320, 360, 390, 820 or 1,440 px, and has no axe violation`, async ({
    page,
  }) => {
    for (const width of [320, 360, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        `${path} at ${width} px`,
      ).toBeLessThanOrEqual(0);
      expect((await axe(page).analyze()).violations.map((v) => `${path} at ${width} px: ${v.id}`)).toEqual([]);
    }
  });
}

// #534: the inline mark (#531) counted in the header's narrowest width, where the <img> before it did not, and a
// header set in a fallback face (CI's runner drew the 404 pages so) went 9 px past a 360 px window.
test("the header fits the window when the web fonts do not load", async ({ page }) => {
  await page.route(/\.(woff2?|ttf)$/, (route) => route.abort());
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/404.html");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      `at ${width} px`,
    ).toBeLessThanOrEqual(0);
    // Row 1.63: the name does not run under Menu.
    const name = await page.getByRole("banner").getByRole("link", { name: "Wayfarer", exact: true }).boundingBox();
    const menu = await page.getByRole("banner").getByText("Menu", { exact: true }).boundingBox();
    expect((name?.x ?? 0) + (name?.width ?? 0), `the name ends before Menu at ${width} px`).toBeLessThanOrEqual(
      menu?.x ?? 0,
    );
  }
});

// W2.2: every file of docs/ is a page, and the search, the site's one script, finds them.
test("every doc of the repository is a page of the site, its links leading to pages", async ({ page }) => {
  const docs = readdirSync("docs", { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.split("\\").join("/").slice(0, -3));
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

test("/docs/ has the docs' policy, with script from the site's own files, and / script from them alone", async ({
  request,
}) => {
  const docs = (await request.get("/docs/")).headers()["content-security-policy"] ?? "";
  expect(docs.split(";").map((d) => d.trim())).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(docs).not.toContain(", ");
  const site = (await request.get("/")).headers()["content-security-policy"] ?? "";
  expect(site.split(";").map((d) => d.trim())).toContain("script-src 'self'");
  expect(site).not.toMatch(/unsafe-inline|unsafe-eval/);
});

// PLAN-design 1.8: the site is built with React and sends none of it (packages/site/strip-scripts.mjs), and its
// policy has no 'unsafe-inline'. A page with one of Next's scripts left, or an inline one, would break either.
test("no page of the site has a script of Next's, an inline script, an inline handler or a style attribute", () => {
  for (const path of sitePages()) {
    const file = `${DEPLOY}${path.endsWith("/") ? `${path}index.html` : path}`;
    const html = readFileSync(file, "utf8");
    // Every script, closed or not, is a file of the site's own or data.
    const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(
      scripts.filter((tag) => !/\ssrc="\/(?!_next\/)[^"]*"/i.test(tag) && !/\stype="application\/ld\+json"/i.test(tag)),
      path,
    ).toEqual([]);
    expect(html.match(/\s(style|on[a-z]+)="/g) ?? [], path).toEqual([]);
  }
});

// What the pages do in the browser is public/site.js: the landing's demo and the theme toggle.
test("the landing's demo plays to its answer and again on Replay, and the toggle switches the theme the app reads", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("wayfarer:theme", "dark"));
  await page.reload();
  const demo = page.locator("[data-demo]");
  await expect(demo.getByText("200 OK")).toBeVisible({ timeout: 10_000 });
  await expect(demo.locator("[data-demo-address]")).toHaveText("https://api.example.com/v1/users/42");
  await demo.getByRole("button", { name: "Replay" }).click();
  await expect(demo.getByText("200 OK")).toBeHidden();
  await expect(demo.getByText("200 OK")).toBeVisible({ timeout: 10_000 });

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch between light and dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("wayfarer:theme"))).toBe("light");
  await page.goto("/app/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("with reduced motion the demo shows its answer at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("[data-demo]").getByText("200 OK")).toBeVisible({ timeout: 1_000 });
});

// D5-e: the demo shows the same request's key as it was sent and as history keeps it. Two radio buttons and a rule
// of the stylesheet, so it works without script too.
for (const javaScriptEnabled of [true, false]) {
  test(`the demo shows the key as sent and as history keeps it (script ${javaScriptEnabled ? "on" : "off"})`, async ({
    browser,
  }) => {
    const page = await browser.newPage({ javaScriptEnabled });
    await page.goto("/");
    const demo = page.locator("[data-demo]");
    const sent = demo.getByText("Bearer 7c41f0a9d2e86b35");
    await expect(sent).toBeVisible();
    await expect(demo.getByText("The key goes in clear, to api.example.com only.")).toBeVisible();
    await demo.getByRole("group", { name: "Show the request's key" }).getByRole("radio", { name: "Sent" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(demo.getByRole("radio", { name: "Kept in history" })).toBeChecked();
    await expect(sent).toBeHidden();
    await expect(demo.getByText("History, exports and copies keep a mask.")).toBeVisible();
    await demo.getByRole("radio", { name: "Sent" }).click();
    await expect(sent).toBeVisible();
    await page.close();
  });
}

// D5-e: the header's Open Wayfarer took two lines at 320 and 390 px.
test("the header's Open Wayfarer is one line at every phone width", async ({ page }) => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const open = page.getByRole("banner").getByRole("link", { name: "Open Wayfarer" });
    const lines = await open.evaluate((link) => {
      const range = document.createRange();
      range.selectNodeContents(link);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });
    expect(lines, `at ${width} px`).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
  // Below 1024 px the theme is in the menu.
  await page.getByRole("banner").getByText("Menu", { exact: true }).click();
  await expect(page.getByRole("banner").getByRole("button", { name: "Switch between light and dark" })).toBeVisible();
});

// D5-e: the ledger's IDs broke a character a line beside the statements' column.
test("each ID of the claims ledger is on one line", async ({ page }) => {
  await page.goto("/docs/claims/");
  expect(await page.locator("article table tbody tr").count()).toBeGreaterThan(60);
  const wrapped = await page.locator("article table tbody tr td:first-child").evaluateAll((cells) =>
    cells
      .filter((cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1;
      })
      .map((cell) => cell.textContent),
  );
  expect(wrapped).toEqual([]);
});

// W2.4: the changelog and the roadmap are pages, and the ledger says which CI run the deployed files passed.
test("the changelog folds each version under an index, and the roadmap is said in a user's terms", async ({ page }) => {
  await page.goto("/changelog/");
  await expect(page.getByText("All notable changes")).toHaveCount(0);
  const index = page.getByRole("navigation", { name: "Versions" });
  await expect(index.getByRole("link", { name: /^Coming in the next release/ })).toBeVisible();
  // Only the latest release is open; another opens with a click on its heading.
  await expect(page.locator("details.version[open]")).toHaveCount(1);
  const next = page.locator("details.version").first();
  await expect(next.getByRole("heading", { name: "Coming in the next release" })).toBeVisible();
  await expect(next).not.toHaveAttribute("open");
  await next.locator("summary").click();
  await expect(next).toHaveAttribute("open");
  await page.goto("/roadmap/");
  await expect(page.getByRole("heading", { name: /^(Shipped|Coming) in 3\.0$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next" })).toBeVisible();
  const later = page.locator("section", { has: page.getByRole("heading", { name: "Later" }) });
  await expect(later.getByText(/Git repository/)).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/\b[DWT]\d+\.\d+\b/);
});

const RUN = { run: 38850000000, commit: "0123456789abcdef0123456789abcdef01234567", date: "2026-10-16T05:00:00Z" };

test("the claims page names the CI run its deploy passed, on each claim's row", async ({ page }) => {
  await page.route("**/ci-run.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RUN) }),
  );
  await page.goto("/docs/claims/");
  const table = page.locator("article table").first();
  await expect(table.locator("thead th").last()).toHaveText("Last CI");
  const rows = await table.locator("tbody tr").count();
  expect(rows).toBeGreaterThan(60);
  await expect(table.getByRole("link", { name: "Passed" })).toHaveCount(rows);
  await expect(table.getByRole("link", { name: "Passed" }).first()).toHaveAttribute(
    "href",
    `https://github.com/AshwinSathian/wayfarer/actions/runs/${RUN.run}`,
  );
  await expect(page.locator(".ci-note")).toContainText("0123456789ab");
  await expect(page.locator(".ci-note")).toContainText("2026-10-16");
});

test("with no CI run, or a file that is not one, the claims page says it has no result", async ({ page }) => {
  await page.goto("/docs/claims/");
  await expect(page.locator(".ci-note")).toHaveText(/not deployed from a CI run/);
  await expect(page.getByRole("link", { name: "Passed" })).toHaveCount(0);
  await page.route("**/ci-run.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...RUN, commit: "<b>x</b>" }),
    }),
  );
  await page.reload();
  await expect(page.locator(".ci-note")).toHaveText(/not deployed from a CI run/);
  await expect(page.locator("article b")).toHaveCount(0);
});
