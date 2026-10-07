import { afterEach, describe, expect, it, vi } from "vitest";
import { allowScriptUrl, installTrustedTypesPolicy } from "./trusted-types";

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

  afterEach(() => vi.unstubAllGlobals());

  it("installs a default policy that can create script URLs and nothing else: no HTML, no script text", () => {
    const createPolicy = vi.fn();
    vi.stubGlobal("trustedTypes", { createPolicy });

    installTrustedTypesPolicy();

    expect(createPolicy).toHaveBeenCalledOnce();
    const [name, options] = createPolicy.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe("default");
    expect(Object.keys(options)).toEqual(["createScriptURL"]);
    expect((options["createScriptURL"] as (input: string) => string | null)("https://evil.example/x.js")).toBeNull();
  });
});
