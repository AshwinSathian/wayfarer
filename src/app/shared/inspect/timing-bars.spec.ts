import { describe, expect, it } from "vitest";
import { ResponseInspection } from "./response-inspector";
import { formatBytes, formatMs, getFallbackBars, getTimingBars } from "./timing-bars";

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
    expect(getFallbackBars(inspection({ duration: 80 }))).toMatchObject([{ label: "Total", duration: 80, percent: 100 }]);
  });

  it("formats durations with more precision the smaller they are", () => {
    expect([undefined, null, 0, -3].map(formatMs)).toEqual(["—", "—", "—", "—"]);
    expect(formatMs(0.256)).toBe("0.26 ms");
    expect(formatMs(12.34)).toBe("12.3 ms");
    expect(formatMs(99.96)).toBe("100.0 ms");
    expect(formatMs(1234.6)).toBe("1235 ms");
  });

  it("formats sizes in binary units and stops at GB", () => {
    expect([undefined, 0, -1].map(formatBytes)).toEqual(["—", "—", "—"]);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(15 * 1024)).toBe("15.0 KB");
    expect(formatBytes(256 * 1024)).toBe("256 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.00 GB");
    expect(formatBytes(5000 * 1024 ** 3)).toBe("5000 GB");
  });
});
