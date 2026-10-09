import { describe, expect, it } from "vitest";
import { FORBIDDEN_METHODS, emptyAuth, emptyRequest, fileIdsOf, isHttpMethod } from "./request";
import { validateRequestContent } from "./validate";

describe("request model", () => {
  it("starts an auth type with every field it has, empty", () => {
    expect(emptyAuth("none")).toEqual({ type: "none" });
    expect(emptyAuth("bearer")).toEqual({ type: "bearer", token: "" });
    expect(emptyAuth("basic")).toEqual({ type: "basic", username: "", password: "" });
    expect(emptyAuth("apikey")).toEqual({ type: "apikey", key: "", value: "", in: "header" });
  });

  it("lists the files of every part of a body, not only the part its mode sends", () => {
    expect(fileIdsOf({ mode: "none" })).toEqual([]);
    expect(
      fileIdsOf({
        mode: "raw",
        raw: { language: "json", text: "{}" },
        multipart: [
          { kind: "text", key: "a", value: "f-0", enabled: true },
          { kind: "file", key: "b", fileId: "f-1", fileName: "one.bin", enabled: false },
        ],
        binary: { fileId: "f-2", fileName: "two.bin" },
      })
    ).toEqual(["f-1", "f-2"]);
  });

  it("knows a method by RFC 9110's token, and the three a browser will not send", () => {
    expect(["GET", "PURGE", "M-SEARCH", "!#$%&'*+-.^_`|~09AZ"].every(isHttpMethod)).toBe(true);
    expect(["", "get", "A B", "A/B", "A:B", "(A)", "A".repeat(33)].some(isHttpMethod)).toBe(false);
    expect(FORBIDDEN_METHODS).toEqual(["CONNECT", "TRACE", "TRACK"]);
  });

  it("makes a new request each time, missing only its URL", () => {
    const first = emptyRequest();
    first.headers.push({ key: "A", value: "1", enabled: true });

    expect(emptyRequest().headers).toEqual([]);
    expect(validateRequestContent(emptyRequest(), "r").map((issue) => issue.path)).toEqual(["r.url"]);
  });
});
