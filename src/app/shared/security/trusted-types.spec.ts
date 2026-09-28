import { describe, expect, it } from "vitest";
import { allowHtml, allowScriptUrl } from "./trusted-types";

const ORIGIN = "https://wayfarer.ashwinsathian.com";

describe("Trusted Types default policy", () => {
  it("allows script URLs on the app's own origin only", () => {
    expect(allowScriptUrl("/sw.js", ORIGIN)).toBe(`${ORIGIN}/sw.js`);
    expect(allowScriptUrl(`${ORIGIN}/worker-ABCDEFGH.js`, ORIGIN)).toBe(`${ORIGIN}/worker-ABCDEFGH.js`);
    for (const bad of [
      "https://evil.example/x.js",
      "//evil.example/x.js",
      "data:text/javascript,alert(1)",
      "javascript:alert(1)",
      "blob:https://evil.example/uuid",
      `https://wayfarer.ashwinsathian.com.evil.example/x.js`,
      "http://wayfarer.ashwinsathian.com/x.js",
    ]) {
      expect(allowScriptUrl(bad, ORIGIN), bad).toBeNull();
    }
  });

  it("allows only the empty string as HTML", () => {
    expect(allowHtml("")).toBe("");
    expect(allowHtml("<b>x</b>")).toBeNull();
    expect(allowHtml("<img src=x onerror=alert(1)>")).toBeNull();
    expect(allowHtml(" ")).toBeNull();
  });
});
