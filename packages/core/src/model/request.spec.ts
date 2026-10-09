import { describe, expect, it } from "vitest";
import { emptyAuth, emptyRequest } from "./request";
import { validateRequestContent } from "./validate";

describe("request model", () => {
  it("starts an auth type with every field it has, empty", () => {
    expect(emptyAuth("none")).toEqual({ type: "none" });
    expect(emptyAuth("bearer")).toEqual({ type: "bearer", token: "" });
    expect(emptyAuth("basic")).toEqual({ type: "basic", username: "", password: "" });
    expect(emptyAuth("apikey")).toEqual({ type: "apikey", key: "", value: "", in: "header" });
  });

  it("makes a new request each time, missing only its URL", () => {
    const first = emptyRequest();
    first.headers.push({ key: "A", value: "1", enabled: true });

    expect(emptyRequest().headers).toEqual([]);
    expect(validateRequestContent(emptyRequest(), "r").map((issue) => issue.path)).toEqual(["r.url"]);
  });
});
