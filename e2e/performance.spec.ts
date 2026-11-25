import { test, expect, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";

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

test("the page the server sends, and the scripts it loads first, hold none of Monaco, QuickJS, GraphQL, the OpenAPI importer or YAML", async ({
  request,
}) => {
  const html = await (await request.get("/app/")).text();
  const first = [...html.matchAll(/<script[^>]+src="([^"]+)"|<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(
    (match) => match[1] ?? match[2],
  );
  expect(first.length).toBeGreaterThan(0);
  // What those import at once (`import … from "./x.js"`) loads first too; an `import()` does not.
  const seen = new Set<string>();
  const texts: string[] = [];
  for (let queue = [...first]; queue.length;) {
    const path = queue.shift() ?? "";
    if (seen.has(path)) continue;
    seen.add(path);
    const text = await (await request.get(`/app/${path.replace(/^\.?\//, "")}`)).text();
    texts.push(text);
    queue.push(
      ...[...text.matchAll(/(?:^|[;}\s])import(?:[^("']*?from)?\s*["']\.\/([^"']+\.js)["']/g)].map((match) => match[1]),
    );
  }
  for (const [library, marker] of Object.entries(LAZY)) {
    expect(
      texts.some((text) => text.includes(marker)),
      library,
    ).toBe(false);
  }
});

// Monaco ran for 300 ms of the main thread at every load (Lighthouse TBT 275 ms on CI's runner): a closed dialog's
// script editor, made with the page, loaded it. No editor is on the first screen, so nothing of Monaco is fetched.
test("loading the app fetches nothing of Monaco: no editor is on the first screen", async ({ page }) => {
  const monaco: string[] = [];
  page.on("request", (request) => {
    if (/monaco/i.test(request.url())) monaco.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(monaco).toEqual([]);
  // The Scripts tab makes its editors when first chosen, and Monaco comes with them.
  await page
    .locator(".composer-pane")
    .getByRole("tab", { name: /^Scripts( |$)/ })
    .click();
  await expect(page.locator("app-scripts-panel .monaco-editor").first()).toBeVisible({ timeout: 15_000 });
  expect(monaco.length).toBeGreaterThan(0);
});

test("typing into the address with five tabs open answers each key within 100 ms", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const address = page.locator("input.address-url");
  await expect(address).toBeVisible();
  for (let tab = 1; tab < 5; tab++) await page.keyboard.press("Alt+t");
  await expect(page.getByRole("tablist", { name: "Open requests" }).getByRole("tab")).toHaveCount(5);
  await expect(address).toBeFocused();

  // Event Timing, where the engine has it (Chromium, Firefox): each key's input delay and processing, the app's part of
  // INP. Its presentation part is left out: CI's headless Chromium draws in software, and there the next frame alone took
  // 100 to 160 ms (while processing stayed under 32 ms at 6x CPU throttling here). WebKit has no Event Timing: there,
  // from each keydown to the frame after it is handled.
  await page.evaluate(() => {
    const record = { keys: 0, slow: [] as number[] };
    (window as unknown as { __keys: typeof record }).__keys = record;
    document.addEventListener("keydown", () => void record.keys++, true);
    if ("PerformanceEventTiming" in window) {
      // An interaction under 16 ms is not reported, and counts as answered at once.
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceEventTiming[])
          if (entry.interactionId && entry.name === "keydown") record.slow.push(entry.processingEnd - entry.startTime);
      }).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
    } else {
      document.addEventListener(
        "keydown",
        (event) => {
          const start = event.timeStamp;
          requestAnimationFrame(() => setTimeout(() => record.slow.push(performance.now() - start), 0));
        },
        true,
      );
    }
  });
  // At 120 ms a key, a quick typist's pace: slower would hide the cost, faster measures a queue of keys rather than one.
  const text = "https://api.example.com/v1/users/{{id}}/orders?page=2&size=50";
  await page.keyboard.type(text, { delay: 120 });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __keys: { keys: number } }).__keys.keys))
    .toBe(text.length);
  await page.waitForTimeout(500);
  const { keys, slow } = await page.evaluate(
    () => (window as unknown as { __keys: { keys: number; slow: number[] } }).__keys,
  );
  // INP: the worst interaction, leaving out one for every 50.
  const worst = [...slow].sort((a, b) => b - a);
  const inp = worst[Math.floor(keys / 50)] ?? 0;
  expect(
    inp,
    `the slowest key interactions (ms): ${worst.slice(0, 10).map(Math.round).join(", ")}`,
  ).toBeLessThanOrEqual(100);
});

// BB3: a budget on the first interaction and on a large body. Method: the production build, headless Chromium at 1440 x
// 900, five runs on a 2026 laptop (Apple M4 Pro); each budget is about 3x the slowest of the five runs (ms), so a CI
// runner's noise does not fail it and a real regression (a body parsed on the main thread) does.
//   key (a character typed into the address)        13-17      budget 100
//   send (Send to a 200, from the echo server)       124-168    budget 500
//   input (slowest first click or key, to handled)   3-4        budget 100 (INP's "good" is 200)
//   5 MB JSON drawn in the viewer                    509-527    budget 1500; longest task 56-59, budget 200
//   1 MB text drawn in the viewer                    408-504    budget 1500; longest task 227-246, budget 750
// Long Tasks and Event Timing are Chromium's: the other engines skip it. By hand with e2e.yml, like every browser test.
const BUDGET = { firstKey: 100, send: 500, firstInput: 100, drawn: 1500, longTaskJson: 200, longTaskText: 750 };

interface Probe {
  longTasks: number[];
  inputs: number[];
}

async function probe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record: Probe = { longTasks: [], inputs: [] };
    (window as unknown as { __probe: Probe }).__probe = record;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) record.longTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
    if ("PerformanceEventTiming" in window)
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceEventTiming[])
          if (entry.interactionId) record.inputs.push(entry.processingEnd - entry.startTime);
      }).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
  });
}

const read = (page: Page): Promise<Probe> => page.evaluate(() => (window as unknown as { __probe: Probe }).__probe);

test.describe("performance budget (BB3)", () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Long Tasks and Event Timing are Chromium's");
    await page.setViewportSize({ width: 1440, height: 900 });
    await probe(page);
  });

  test("the address takes a typed character and Send answers, and the first click and key are handled, within the budget", async ({
    page,
  }) => {
    await page.goto("/app/");
    const address = page.locator("input.address-url");
    await expect(address).toBeVisible();
    await expect(address).toBeFocused();
    const keyStart = Date.now();
    await page.keyboard.press("h");
    await expect(address).toHaveValue("h");
    const firstKey = Date.now() - keyStart;
    await address.fill(`${ECHO}/echo`);
    const sendStart = Date.now();
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200");
    const send = Date.now() - sendStart;
    await page.waitForTimeout(300);
    const { inputs } = await read(page);
    const firstInput = Math.max(0, ...inputs);
    console.log(
      `BB3 first interaction: key ${firstKey} ms, send ${send} ms, slowest input ${Math.round(firstInput)} ms`,
    );
    expect(firstKey, "a typed character reaches the field").toBeLessThanOrEqual(BUDGET.firstKey);
    expect(send, "Send to a 200").toBeLessThanOrEqual(BUDGET.send);
    expect(firstInput, "the slowest of the first click and key, input delay and processing").toBeLessThanOrEqual(
      BUDGET.firstInput,
    );
  });

  for (const [kind, shown, longTask] of [
    ["json", ".monaco-editor", BUDGET.longTaskJson],
    ["text", "pre", BUDGET.longTaskText],
  ] as const) {
    test(`a ${kind === "json" ? 5 : 1} MB ${kind} response is drawn within the budget and no task freezes the page`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto("/app/");
      await page.locator("input.address-url").fill(`${ECHO}/big-${kind}/${kind === "json" ? 5 : 1}`);
      await expect(page.locator("input.address-url")).toHaveValue(/big-/);
      await page.evaluate(() => void ((window as unknown as { __probe: Probe }).__probe.longTasks.length = 0));
      const start = Date.now();
      await page.getByRole("button", { name: "Send request" }).click();
      await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 60_000 });
      await expect(page.locator(`app-response-viewer ${shown}`).first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(/line 0:|"item-0"/).first()).toBeVisible({ timeout: 60_000 });
      const drawn = Date.now() - start;
      await page.waitForTimeout(500);
      const { longTasks } = await read(page);
      const longest = Math.max(0, ...longTasks);
      console.log(`BB3 large ${kind}: drawn ${drawn} ms, longest task ${Math.round(longest)} ms`);
      expect(drawn, "from Send to the body on screen").toBeLessThanOrEqual(BUDGET.drawn);
      expect(longest, `the longest task (ms), all: ${longTasks.map(Math.round).join(", ")}`).toBeLessThanOrEqual(
        longTask,
      );
    });
  }
});
