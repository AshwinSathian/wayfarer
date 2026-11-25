import { describe, expect, it } from "vitest";
import { scriptFlags } from "./review";

describe("scriptFlags", () => {
  it("@claim:C-109 numbers the lines that name sendRequest, whatever the call looks like", () => {
    const text = ["const a = 1;", "pm.sendRequest('https://x.test', cb);", "pm\r", '  ["sendRequest"](u);'].join("\n");
    expect(scriptFlags(text).sendRequestLines).toEqual([2, 4]);
    expect(scriptFlags("const { sendRequest } = pm;").sendRequestLines).toEqual([1]);
    expect(scriptFlags("pm.sendRequestLater = 1").sendRequestLines).toEqual([]);
  });

  it("says whether variables are named", () => {
    expect(scriptFlags("pm.environment.set('a', 1)").variables).toBe(true);
    expect(scriptFlags("pm . collectionVariables.get('a')").variables).toBe(true);
    expect(scriptFlags("pm.test('ok', () => {})").variables).toBe(false);
  });
});
