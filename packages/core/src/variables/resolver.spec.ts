import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Row } from "../model/request";
import { MAX_VARIABLE_DEPTH, VARIABLE_SCOPES, VariableNestingError, VariableResolver, type ScopeStack } from "./resolver";

const row = (key: string, value: string, enabled = true): Row => ({ key, value, enabled });
const rowsOf = (record: Record<string, string>): Row[] => Object.entries(record).map(([key, value]) => row(key, value));

/** A name a user could give a variable. */
const name = fc.stringMatching(/^[A-Za-z_][\w.-]{0,8}$/);
/** Text with no placeholder in it. */
const plain = fc.string().filter((text) => !text.includes("{{"));

describe("VariableResolver", () => {
  describe("moved from the app's env-resolution", () => {
    const stack: ScopeStack = {
      local: rowsOf({ requestOnly: "req-value", host: "local.request" }),
      environment: rowsOf({ baseHost: "jsonplaceholder.typicode.com", token: "env-token", host: "env.host" }),
      global: rowsOf({ globalOnly: "global-value", token: "global-token" }),
    };

    it("prefers request variables over environment and globals", () => {
      const tokens = new VariableResolver(stack).tokens({
        url: "https://{{host}}/data",
        headers: [{ key: "Authorization", value: "Bearer {{token}}" }],
      });
      const host = tokens.find((t) => t.key === "host");
      const token = tokens.find((t) => t.key === "token");
      expect(host?.value).toBe("local.request");
      expect(host?.source).toBe("local");
      expect(token?.value).toBe("env-token");
      expect(token?.source).toBe("environment");
    });

    it("flags missing variables without blocking", () => {
      const tokens = new VariableResolver({}).tokens({ url: "https://{{missing}}/api" });
      const missing = tokens.find((t) => t.source === "missing");
      expect(missing?.key).toBe("missing");
      expect(missing?.value).toBeUndefined();
    });

    it("leaves a name that only exists on Object.prototype as literal text", () => {
      expect(new VariableResolver(stack).resolve("{{constructor}}/{{toString}}/{{__proto__}}")).toBe(
        "{{constructor}}/{{toString}}/{{__proto__}}"
      );
    });

    it("substitutes every resolvable {{key}} occurrence with its resolved value", () => {
      const resolver = new VariableResolver(stack);
      expect(resolver.resolve("https://{{baseHost}}/todos/1")).toBe("https://jsonplaceholder.typicode.com/todos/1");
      expect(resolver.resolve("Bearer {{token}}")).toBe("Bearer env-token");
    });

    it("resolves multiple distinct placeholders in the same string", () => {
      expect(new VariableResolver(stack).resolve("{{baseHost}}/{{requestOnly}}/{{globalOnly}}")).toBe(
        "jsonplaceholder.typicode.com/req-value/global-value"
      );
    });

    it("leaves an unresolvable placeholder as literal text instead of blanking it", () => {
      expect(new VariableResolver(stack).resolve("https://{{missing}}/api")).toBe("https://{{missing}}/api");
    });

    it("is a no-op for text with no placeholders", () => {
      expect(new VariableResolver(stack).resolve("https://example.com/api")).toBe("https://example.com/api");
    });
  });

  it("lists the variables of the URL, of each header's name and value, and of each body text, once per text", () => {
    const tokens = new VariableResolver({ collection: rowsOf({ a: "1" }) }).tokens({
      url: "{{a}}/{{a}}",
      headers: [{ key: "{{h}}", value: "{{a}}" }],
      body: ["{{$guid}}", "{{$secret.s-1}}"],
    });
    expect(tokens).toEqual([
      { key: "a", source: "collection", value: "1", location: "url", field: "endpoint" },
      { key: "h", source: "missing", location: "header", field: "header-0-key" },
      { key: "a", source: "collection", value: "1", location: "header", field: "header-0-value" },
      { key: "$guid", source: "dynamic", location: "body", field: "body-0" },
      { key: "$secret.s-1", source: "secret", location: "body", field: "body-1" },
    ]);
    expect(new VariableResolver({}).tokens({})).toEqual([]);
  });

  it("precedence: the nearest scope that has the name gives the value (property)", () => {
    fc.assert(
      fc.property(fc.subarray([...VARIABLE_SCOPES], { minLength: 1 }), name, (holders, key) => {
        const stack: ScopeStack = Object.fromEntries(holders.map((scope) => [scope, [row(key, `from-${scope}`)]]));
        const nearest = VARIABLE_SCOPES.find((scope) => holders.includes(scope));
        const resolver = new VariableResolver(stack);
        expect(resolver.resolve(`{{${key}}}`)).toBe(`from-${nearest}`);
        expect(resolver.tokens({ url: `{{ ${key} }}` })[0].source).toBe(nearest);
      })
    );
  });

  it("within a scope a later row wins, and a switched-off row gives nothing", () => {
    const resolver = new VariableResolver({
      environment: [row("a", "first"), row("a", "second"), row("off", "x", false)],
      global: [row("off", "from-global")],
    });
    expect(resolver.resolve("{{a}} {{off}}")).toBe("second from-global");
  });

  it("is idempotent on text that is fully resolved (property)", () => {
    fc.assert(
      fc.property(plain, fc.dictionary(name, plain), fc.array(name), (text, variables, used) => {
        const resolver = new VariableResolver({ environment: rowsOf(variables) });
        expect(resolver.resolve(text)).toBe(text);
        const template = text + used.map((key) => `{{${key}}}`).join(text);
        const once = resolver.resolve(template);
        // What is left unresolved is left as written, so a second pass changes nothing either.
        expect(resolver.resolve(once)).toBe(once);
      })
    );
  });

  it("resolves a value that holds variables, through ten of them", () => {
    const chain = Array.from({ length: MAX_VARIABLE_DEPTH }, (_, i) => row(`v${i}`, i === MAX_VARIABLE_DEPTH - 1 ? "end" : `{{v${i + 1}}}`));
    expect(new VariableResolver({ environment: chain }).resolve("<{{v0}}>")).toBe("<end>");
    const resolver = new VariableResolver({ environment: rowsOf({ a: "{{b}}/{{nowhere}}", b: "B" }) });
    expect(resolver.resolve("{{a}}")).toBe("B/{{nowhere}}");
    expect([...resolver.unresolved]).toEqual(["nowhere"]);
  });

  it("refuses an eleventh, naming the chain", () => {
    const chain = Array.from({ length: MAX_VARIABLE_DEPTH + 1 }, (_, i) => row(`v${i}`, `{{v${i + 1}}}`));
    const attempt = () => new VariableResolver({ environment: chain }).resolve("{{v0}}");
    expect(attempt).toThrow(VariableNestingError);
    expect(attempt).toThrow("Variables are nested more than 10 deep: {{v0}} → {{v1}}");
  });

  it("detects a cycle of any length and names it (property)", () => {
    fc.assert(
      fc.property(fc.uniqueArray(name, { minLength: 1, maxLength: MAX_VARIABLE_DEPTH }), (names) => {
        const cycle = names.map((key, index) => row(key, `x{{${names[(index + 1) % names.length]}}}`));
        const resolver = new VariableResolver({ environment: cycle });
        let thrown: unknown;
        try {
          resolver.resolve(`{{${names[0]}}}`);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(VariableNestingError);
        expect((thrown as VariableNestingError).chain).toEqual([...names, names[0]]);
        expect((thrown as VariableNestingError).message).toContain("in a circle");
        // A chip for it says why, and does not throw.
        const token = resolver.tokens({ url: `{{${names[0]}}}` })[0];
        expect(token).toMatchObject({ source: "environment", error: (thrown as Error).message });
        expect(token.value).toBeUndefined();
      })
    );
  });

  it("passes on an error that is not about nesting", () => {
    const resolver = new VariableResolver({ environment: rowsOf({ a: "{{$secret.x}}" }) }, () => {
      throw new TypeError("vault broke");
    });
    expect(() => resolver.tokens({ url: "{{a}}" })).toThrow(TypeError);
  });

  describe("dynamic variables", () => {
    const resolver = new VariableResolver({});
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it("gives a new value for each use", () => {
      const [first, second] = resolver.resolve("{{$guid}} {{$randomUUID}}").split(" ");
      expect(first).toMatch(uuid);
      expect(second).toMatch(uuid);
      expect(first).not.toBe(second);
    });

    it("gives the time in seconds and as ISO 8601", () => {
      const before = Math.floor(Date.now() / 1000);
      const seconds = Number(resolver.resolve("{{$timestamp}}"));
      expect(seconds).toBeGreaterThanOrEqual(before);
      expect(seconds).toBeLessThanOrEqual(before + 2);
      const iso = resolver.resolve("{{$isoTimestamp}}");
      expect(new Date(iso).toISOString()).toBe(iso);
    });

    it("gives a whole number from 0 to 1000 and one letter or digit", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 2000; i++) {
        const [int, char] = resolver.resolve("{{$randomInt}} {{$randomAlphaNumeric}}").split(" ");
        expect(int).toMatch(/^\d{1,4}$/);
        expect(Number(int)).toBeLessThanOrEqual(1000);
        expect(char).toMatch(/^[A-Za-z0-9]$/);
        seen.add(char);
      }
      // Every one of the 62 turns up: none is shut out by how the bits are cut down.
      expect(seen.size).toBe(62);
    });

    it("leaves a name it does not know as written, and a row of that name is used", () => {
      expect(resolver.resolve("{{$randomColor}}")).toBe("{{$randomColor}}");
      expect([...resolver.unresolved]).toEqual(["$randomColor"]);
      expect(new VariableResolver({ global: rowsOf({ $mine: "1" }) }).resolve("{{$mine}}")).toBe("1");
    });
  });

  describe("secrets", () => {
    it("asks the callback, records the plaintext as tainted, and does not read the plaintext for variables", () => {
      const asked: string[] = [];
      const resolver = new VariableResolver({ environment: rowsOf({ token: "t", apiKey: "{{$secret.id-1}}" }) }, (id) => {
        asked.push(id);
        return "{{token}}";
      });
      expect(resolver.resolve("Bearer {{apiKey}}")).toBe("Bearer {{token}}");
      expect(asked).toEqual(["id-1"]);
      expect([...resolver.taint]).toEqual(["{{token}}"]);
      expect([...resolver.lockedSecrets]).toEqual([]);
      expect([...resolver.unresolved]).toEqual([]);
    });

    it("leaves the reference as written and lists the id when the secret is not given", () => {
      const resolver = new VariableResolver({});
      expect(resolver.resolve("{{$secret.abc}} {{ $secret.abc }}")).toBe("{{$secret.abc}} {{ $secret.abc }}");
      expect([...resolver.lockedSecrets]).toEqual(["abc"]);
      expect(resolver.taint.size).toBe(0);
    });
  });
});

describe("folder variables (P4.9)", () => {
  const stack: ScopeStack = {
    environment: [row("who", "environment")],
    // The folders' rows, outermost first: the nearest folder's row is the later one.
    folder: [row("who", "outer folder"), row("where", "outer folder"), row("where", "inner folder"), row("what", "folder")],
    collection: [row("who", "collection"), row("where", "collection"), row("what", "collection"), row("why", "collection")],
  };

  it("win over the collection's and lose to the environment's, the nearest folder first", () => {
    const resolver = new VariableResolver(stack);
    expect(resolver.resolve("{{who}} / {{where}} / {{what}} / {{why}}")).toBe("environment / inner folder / folder / collection");
    expect(resolver.tokens({ url: "{{where}}" })[0]).toMatchObject({ source: "folder", value: "inner folder" });
  });

  it("the scopes, nearest first", () => {
    expect(VARIABLE_SCOPES).toEqual(["local", "data", "environment", "folder", "collection", "global"]);
  });
});
