import { describe, expect, it } from "vitest";
import { evaluatePath } from "./json-path";

const body = {
  data: { items: [{ id: 1, tags: ["a", "b"] }, { id: 2, tags: ["c"] }, { name: "no id" }] },
  "*": "a key named star",
  text: "abc",
};

describe("evaluatePath (P2.13: the assertion runner's dot path, plus [*])", () => {
  it("reads keys and indexes, as assertions always have", () => {
    expect(evaluatePath(body, "data.items[0].id")).toBe(1);
    expect(evaluatePath(body, "data.items.1.id")).toBe(2);
    expect(evaluatePath(body, "data.items.length")).toBe(3);
    expect(evaluatePath(body, "text.length")).toBe(3);
    expect(evaluatePath(body, "")).toBe(body);
  });

  it("gives undefined for a path that leads nowhere", () => {
    expect(evaluatePath(body, "data.nope.deeper")).toBeUndefined();
    expect(evaluatePath(null, "a")).toBeUndefined();
    expect(evaluatePath(5, "a")).toBeUndefined();
  });

  it("reads own keys only (F63): a path cannot reach the prototype", () => {
    expect(evaluatePath(body, "constructor")).toBeUndefined();
    expect(evaluatePath(body, "__proto__")).toBeUndefined();
    expect(evaluatePath(body, "data.items.map")).toBeUndefined();
    expect(evaluatePath(body, "toString")).toBeUndefined();
  });

  it("[*] takes every item of an array, leaving out the ones without the rest of the path", () => {
    expect(evaluatePath(body, "data.items[*].id")).toEqual([1, 2]);
    expect(evaluatePath(body, "data.items[*]")).toEqual(body.data.items);
  });

  it("[*] takes every value of an object", () => {
    expect(evaluatePath({ a: { n: 1 }, b: { n: 2 } }, "[*].n")).toEqual([1, 2]);
  });

  it("a second [*] gives one flat list", () => {
    expect(evaluatePath(body, "data.items[*].tags[*]")).toEqual(["a", "b", "c"]);
  });

  it("[*] of something that holds nothing is an empty list", () => {
    expect(evaluatePath(body, "text[*]")).toEqual([]);
  });

  it("a key that is a star is still read with a dot", () => {
    expect(evaluatePath(body, "*")).toBe("a key named star");
  });
});
