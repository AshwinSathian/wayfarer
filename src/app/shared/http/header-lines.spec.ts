import { describe, expect, it } from "vitest";
import { headerLines, rowsFromHeaderLines } from "./header-lines";

describe("headers as lines", () => {
  const rows = [
    { key: "Accept", value: "*/*", enabled: true },
    { key: "X-Off", value: "1", enabled: false },
    { key: "Accept", value: "text/plain", enabled: true },
    { key: "X-Time", value: "12:30:00", enabled: true },
    { key: "__proto__", value: "x", enabled: true },
  ];

  it("writes one line per row, marks a switched-off row with #, and reads its own text back", () => {
    const text = headerLines(rows);

    expect(text).toBe("Accept: */*\n# X-Off: 1\nAccept: text/plain\nX-Time: 12:30:00\n__proto__: x");
    expect(rowsFromHeaderLines(text)).toEqual(rows);
    expect(headerLines([{ key: "", value: "", enabled: true }])).toBe("");
  });

  it("reads pasted text: order and duplicates kept, blank lines skipped, the value split at the first colon", () => {
    expect(rowsFromHeaderLines("  Host:example.test \r\n\r\nX-Empty:\nNoColon\n#Off: a:b\n#\n")).toEqual([
      { key: "Host", value: "example.test", enabled: true },
      { key: "X-Empty", value: "", enabled: true },
      { key: "NoColon", value: "", enabled: true },
      { key: "Off", value: "a:b", enabled: false },
    ]);
    expect(rowsFromHeaderLines("")).toEqual([]);
  });
});
