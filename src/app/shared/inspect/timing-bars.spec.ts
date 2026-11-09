import { describe, expect, it } from "vitest";
import { ResponseInspection } from "./response-inspector";
import { formatBytes, getFallbackBars, getTimingBars } from "./timing-bars";

const inspection = (partial: Partial<ResponseInspection>) => partial as ResponseInspection;

describe("timing-bars", () => {
  it("draws one bar per phase that took time, in network order, sized against the total", () => {
    const bars = getTimingBars(inspection({ duration: 200, phases: { ttfb: 100, dns: 50, tcp: 0, content: 400 } }));

    expect(bars.map((b) => [b.key, b.duration, b.percent])).toEqual([
      ["dns", 50, 25],
      ["ttfb", 100, 50],
      // A phase longer than the total is capped at the full width.
      ["content", 400, 100],
    ]);
    expect(bars.every((b) => !!b.tooltip)).toBe(true);
  });

  it("draws no phase bars without a phase breakdown or a duration", () => {
    expect(getTimingBars(null)).toEqual([]);
    expect(getTimingBars(inspection({ duration: 200 }))).toEqual([]);
    expect(getTimingBars(inspection({ duration: 0, phases: { dns: 5 } }))).toEqual([]);
  });

  it("falls back to a single full-width Total bar when only the duration is known", () => {
    expect(getFallbackBars(null)).toEqual([]);
    expect(getFallbackBars(inspection({ duration: 0 }))).toEqual([]);
    expect(getFallbackBars(inspection({ duration: 80 }))).toMatchObject([
      { label: "Total", duration: 80, percent: 100 },
    ]);
  });

  it("formats sizes in binary units, up to TB, with a word of the caller's for nothing", () => {
    expect([undefined, 0, -1].map((value) => formatBytes(value))).toEqual(["—", "—", "—"]);
    expect(formatBytes(0, "0 B")).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(60)).toBe("60 B");
    expect(formatBytes(1536)).toBe("1.50 kB");
    expect(formatBytes(15 * 1024)).toBe("15.0 kB");
    expect(formatBytes(256 * 1024)).toBe("256 kB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.00 GB");
    expect(formatBytes(5000 * 1024 ** 3)).toBe("4.88 TB");
    // A quota on a large disk: Settings › Storage says it as the response viewer would.
    expect(formatBytes(1.2 * 1024 ** 4)).toBe("1.20 TB");
  });
});
