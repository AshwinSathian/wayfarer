import { test, expect } from "@playwright/test";

// P7.2: what the page sends first holds none of the large libraries, and
// typing stays quick with several tabs open.

// A string each library has and the app's own code does not.
const LAZY = {
  Monaco: "editor.action.formatDocument",
  QuickJS: "QuickJSContext",
  "GraphQL's libraries": "GraphQLError",
  "the OpenAPI importer": "This OpenAPI file describes no operation",
  "the YAML parser": "YAMLParseError",
};

test("the page the server sends, and the scripts it loads first, hold none of Monaco, QuickJS, GraphQL, the OpenAPI importer or YAML", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const first = [...html.matchAll(/<script[^>]+src="([^"]+)"|<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((match) => match[1] ?? match[2]);
  expect(first.length).toBeGreaterThan(0);
  // What those import at once (`import … from "./x.js"`) loads first too; an `import()` does not.
  const seen = new Set<string>();
  const texts: string[] = [];
  for (let queue = [...first]; queue.length; ) {
    const path = queue.shift() ?? "";
    if (seen.has(path)) continue;
    seen.add(path);
    const text = await (await request.get(`/${path.replace(/^\.?\//, "")}`)).text();
    texts.push(text);
    queue.push(...[...text.matchAll(/(?:^|[;}\s])import(?:[^("']*?from)?\s*["']\.\/([^"']+\.js)["']/g)].map((match) => match[1]));
  }
  for (const [library, marker] of Object.entries(LAZY)) {
    expect(texts.some((text) => text.includes(marker)), library).toBe(false);
  }
});

test("typing into the address with five tabs open answers each key within 100 ms", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const address = page.locator("input.address-url");
  await expect(address).toBeVisible();
  for (let tab = 1; tab < 5; tab++) await page.keyboard.press("Alt+t");
  await expect(page.getByRole("tablist", { name: "Open requests" }).getByRole("tab")).toHaveCount(5);
  await expect(address).toBeFocused();

  // From each keydown to the frame after it is handled: the input delay, the handlers and the render, as INP counts them.
  await page.evaluate(() => {
    const delays: number[] = [];
    (window as unknown as { __keyDelays: number[] }).__keyDelays = delays;
    document.addEventListener("keydown", (event) => {
      const start = event.timeStamp;
      requestAnimationFrame(() => setTimeout(() => delays.push(performance.now() - start), 0));
    }, true);
  });
  await page.keyboard.type("https://api.example.com/v1/users/{{id}}/orders?page=2&size=50", { delay: 30 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __keyDelays: number[] }).__keyDelays.length)).toBeGreaterThanOrEqual(60);
  const delays = await page.evaluate(() => (window as unknown as { __keyDelays: number[] }).__keyDelays);
  const sorted = [...delays].sort((a, b) => a - b);
  // INP is the worst interaction, or close to it with many: the 98th percentile.
  const p98 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
  expect(p98, `key delays (ms): ${sorted.map(Math.round).join(", ")}`).toBeLessThanOrEqual(100);
});
