import { describe, expect, it } from "vitest";
import { valueSources } from "./value-sources";

describe("valueSources", () => {
  it("names where each of the auth's variables gets its value, once each", () => {
    expect(
      valueSources(
        [
          { key: "token", source: "environment", vaulted: true, location: "auth", field: "auth-0" },
          { key: "user", source: "collection", value: "ada", location: "auth", field: "auth-1" },
          { key: "token", source: "environment", vaulted: true, location: "auth", field: "auth-1" },
          { key: "host", source: "environment", value: "x", location: "url", field: "endpoint" },
        ],
        "Local",
      ),
    ).toBe(
      "{{token}} comes from the environment Local, as a vault secret. {{user}} comes from the collection's variables.",
    );
  });

  it("says when a variable has no value, is made at each send or is a vault secret by its reference", () => {
    expect(
      valueSources([
        { key: "gone", source: "missing", location: "auth", field: "auth-0" },
        { key: "$guid", source: "dynamic", location: "auth", field: "auth-0" },
        { key: "$secret.s-1", source: "secret", location: "auth", field: "auth-0" },
        { key: "g", source: "global", value: "1", location: "auth", field: "auth-0" },
      ]),
    ).toBe(
      "{{gone}} has no value. {{$guid}} is made new at each send. {{$secret.s-1}} is a vault secret. {{g}} comes from the global variables.",
    );
    expect(valueSources([])).toBe("");
  });
});
