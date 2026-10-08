import { afterEach, describe, expect, it } from "vitest";
import { newId } from "./id.util";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
  // An own property shadows Crypto.prototype.randomUUID; deleting it restores the real one.
  afterEach(() => Reflect.deleteProperty(crypto, "randomUUID"));

  it("returns a v4 UUID", () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it("still returns a distinct v4 UUID where crypto.randomUUID is missing (plain-http origin)", () => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });

    const ids = [newId(), newId()];
    expect(ids[0]).toMatch(UUID_V4);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
