import { test, expect, type Page } from "@playwright/test";
import { send } from "./support/app";
import { ECHO } from "./support/echo";

// F48 (P2.18): nothing may change position once a response is on screen. A
// test, or a person, aims at a tab and presses; if the tab moves between the
// two, the press lands beside it. An opacity change is allowed.

interface Sample {
  frame: number;
  ms: number;
  boxes: Record<string, string>;
}

/**
 * From the frame the status badge first shows `status`, records on every
 * animation frame for `duration` ms where the response tabs, the split
 * gutter and what a person presses next are.
 */
async function sampleAfterResponse(page: Page, status: string, duration: number): Promise<() => Promise<Sample[]>> {
  await page.evaluate(({ status, ms }) => {
    const samples: Sample[] = [];
    const targets = (): [string, Element][] => [
      ...[...document.querySelectorAll("app-response-viewer [role='tab']")].map((tab, index): [string, Element] => [`tab ${index} ${tab.textContent?.trim().split(/\s+/)[0]}`, tab]),
      ...[...document.querySelectorAll(".composer-response-splitter [role='separator']")].map((gutter): [string, Element] => ["gutter", gutter]),
      // What the open pane holds: the view select, the editor, a Download button.
      ...[...document.querySelectorAll("app-response-viewer .tab-pane:not([hidden]) > div > *")].map((element, index): [string, Element] => [`body ${index}`, element]),
      // What a person presses next: the composer's tabs, and what sits in the status bar.
      ...[...document.querySelectorAll("app-composer .composer-pane [role='tab']")].map((tab, index): [string, Element] => [`composer tab ${index}`, tab]),
      ...[...document.querySelectorAll("app-response-viewer .status-badge, app-response-viewer [aria-label='Export response']")].map(
        (element): [string, Element] => [element.matches(".status-badge") ? "status badge" : "Export", element]
      ),
    ];
    const box = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return [x, y, width, height].map((value) => Math.round(value * 100) / 100).join(",");
    };
    let started = 0;
    const tick = (now: number) => {
      if (!started && document.querySelector("app-response-viewer .status-badge")?.textContent?.trim() === status) started = now;
      if (started) samples.push({ frame: samples.length, ms: Math.round(now - started), boxes: Object.fromEntries(targets().map(([name, element]) => [name, box(element)])) });
      if (!started || now - started < ms) requestAnimationFrame(tick);
      else (window as unknown as { __samples: Sample[] }).__samples = samples;
    };
    requestAnimationFrame(tick);
    interface Sample {
      frame: number;
      ms: number;
      boxes: Record<string, string>;
    }
  }, { status, ms: duration });
  return async () => {
    await page.waitForFunction(() => !!(window as unknown as { __samples?: unknown }).__samples);
    return page.evaluate(() => (window as unknown as { __samples: Sample[] }).__samples);
  };
}

/** Every box that was somewhere else in a later frame than in the first one, as "name: first -> later at N ms". */
function movements(samples: Sample[]): string[] {
  const first = samples[0].boxes;
  const moved = new Map<string, string>();
  for (const sample of samples) {
    for (const [name, box] of Object.entries(sample.boxes)) {
      if (name in first && box !== first[name] && !moved.has(name)) moved.set(name, `${name}: ${first[name]} -> ${box} at ${sample.ms} ms`);
    }
    for (const name of Object.keys(first)) {
      if (!(name in sample.boxes) && !moved.has(name)) moved.set(name, `${name}: gone at ${sample.ms} ms`);
    }
  }
  return [...moved.values()];
}

for (const [name, path, status] of [
  ["a JSON response", "/content/json", "200"],
  ["a text response", "/content/text", "200"],
  ["an error status", "/status/404", "404"],
] as const) {
  test(`@claim:C-050 nothing moves in the 500 ms after ${name} arrives`, async ({ page }) => {
    await page.goto("/");
    await page.locator("input.address-url").fill(`${ECHO}${path}`);
    const samples = await sampleAfterResponse(page, status, 500);
    await send(page);
    const recorded = await samples();

    // The sampling saw the response from its first frame, for the whole time, with the tabs and the gutter in it.
    expect(recorded.length).toBeGreaterThan(10);
    expect(recorded.at(-1)?.ms).toBeGreaterThanOrEqual(500);
    expect(Object.keys(recorded[0].boxes)).toEqual(expect.arrayContaining(["tab 0 Body", "tab 1 Headers", "tab 2 Timings", "tab 3 Tests", "gutter", "status badge", "Export"]));
    expect(movements(recorded)).toEqual([]);
  });
}

test("@claim:C-050 nothing moves when a second response replaces the first", async ({ page }) => {
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await page.locator("input.address-url").fill(`${ECHO}/status/404`);
  // Sampling starts at the frame the second response's badge is there.
  const samples = await sampleAfterResponse(page, "404", 500);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("404");
  const recorded = await samples();
  expect(recorded.length).toBeGreaterThan(10);
  expect(movements(recorded)).toEqual([]);
});
