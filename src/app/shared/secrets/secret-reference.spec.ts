import { describe, expect, it } from "vitest";
import { secretIdsIn } from "./secret-reference";

describe("secretIdsIn", () => {
  it("is every secret a value refers to, also inside other text, once each", () => {
    expect(secretIdsIn("{{$secret.a1}}")).toEqual(["a1"]);
    expect(secretIdsIn("Bearer {{ $secret.a1 }}:{{$secret.b-2}} {{$secret.a1}}")).toEqual(["a1", "b-2"]);
    expect(secretIdsIn("plain")).toEqual([]);
    expect(secretIdsIn(undefined)).toEqual([]);
  });
});
