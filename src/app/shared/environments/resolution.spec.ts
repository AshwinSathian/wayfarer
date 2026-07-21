import { collectVariableTokens, resolveTemplate } from "./env-resolution.util";
import { describe, it, expect } from "vitest";

describe("variable resolution", () => {
  it("prefers request variables over environment and globals", () => {
    const tokens = collectVariableTokens(
      {
        url: "https://{{host}}/data",
        headers: [{ key: "Authorization", value: "Bearer {{token}}" }],
      },
      {
        requestVars: { host: "local.request" },
        environment: {
          id: "env-1",
          meta: { id: "env-1", createdAt: 1, updatedAt: 1, version: 1 },
          name: "Env",
          order: 1,
          vars: { host: "env.host", token: "env-token" },
        } as any,
        globals: { token: "global-token" },
      }
    );
    const host = tokens.find((t) => t.key === "host");
    const token = tokens.find((t) => t.key === "token");
    expect(host?.value).toBe("local.request");
    expect(host?.source).toBe("request");
    expect(token?.value).toBe("env-token");
    expect(token?.source).toBe("environment");
  });

  it("flags missing variables without blocking", () => {
    const tokens = collectVariableTokens(
      { url: "https://{{missing}}/api" },
      { requestVars: {}, environment: null, globals: {} }
    );
    const missing = tokens.find((t) => t.source === "missing");
    expect(missing?.key).toBe("missing");
    expect(missing?.value).toBeUndefined();
  });
});

describe("resolveTemplate", () => {
  const context = {
    requestVars: { requestOnly: "req-value" },
    environment: {
      id: "env-1",
      meta: { id: "env-1", createdAt: 1, updatedAt: 1, version: 1 },
      name: "Env",
      order: 1,
      vars: { baseHost: "jsonplaceholder.typicode.com", token: "env-token" },
    } as any,
    globals: { globalOnly: "global-value" },
  };

  it("substitutes every resolvable {{key}} occurrence with its resolved value", () => {
    expect(resolveTemplate("https://{{baseHost}}/todos/1", context)).toBe(
      "https://jsonplaceholder.typicode.com/todos/1"
    );
    expect(resolveTemplate("Bearer {{token}}", context)).toBe("Bearer env-token");
  });

  it("resolves multiple distinct placeholders in the same string", () => {
    expect(
      resolveTemplate("{{baseHost}}/{{requestOnly}}/{{globalOnly}}", context)
    ).toBe("jsonplaceholder.typicode.com/req-value/global-value");
  });

  it("leaves an unresolvable placeholder as literal text instead of blanking it", () => {
    expect(resolveTemplate("https://{{missing}}/api", context)).toBe(
      "https://{{missing}}/api"
    );
  });

  it("is a no-op for text with no placeholders", () => {
    expect(resolveTemplate("https://example.com/api", context)).toBe(
      "https://example.com/api"
    );
  });
});
