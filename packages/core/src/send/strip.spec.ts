import { describe, expect, it } from "vitest";
import type { ExchangeRecord } from "./record";
import { addressProblem, stripView, type StripInput } from "./strip";

const input = (over: Partial<StripInput> = {}): StripInput => ({
  route: "direct",
  paired: false,
  socket: false,
  method: "GET",
  host: "api.example.com",
  secrets: [],
  variables: 0,
  scripts: { count: 0, held: false },
  ...over,
});

const record = (over: Partial<ExchangeRecord> = {}): ExchangeRecord => ({
  status: { code: 200, text: "OK" },
  durationMs: 340,
  route: "direct",
  host: "api.example.com",
  secrets: [],
  masked: { headers: [], responseHeaders: [] },
  kept: { response: true, body: true },
  ...over,
});

describe("the strip before a send", () => {
  it("says where the request leaves from, in the glossary's words", () => {
    expect(stripView(input()).route).toBe("From this page");
    expect(stripView(input({ route: "auto" })).route).toBe("From this page");
    expect(stripView(input({ route: "auto", paired: true })).route).toBe(
      "From this page, then the Local Bridge if it fails",
    );
    expect(stripView(input({ route: "bridge" })).route).toBe("Through the Local Bridge");
  });

  it("is one string: route, method and host, secrets by name, variables and scripts", () => {
    const view = stripView(
      input({ secrets: ["API key"], variables: 2, scripts: { count: 1, held: true }, route: "auto", paired: true }),
    );
    expect(view.text).toBe(
      "From this page, then the Local Bridge if it fails. GET api.example.com. Uses secret: API key. 2 variables, 1 script held.",
    );
    expect(view.line).toBe(
      "From this page, then the Local Bridge if it fails · Uses secret: API key · 2 variables, 1 script held",
    );
    expect(stripView(input({ variables: 1 })).line).toBe("From this page · 1 variable");
    expect(view.hasHost).toBe(true);
  });

  it("names trusted scripts, and a WebSocket has no bridge", () => {
    expect(stripView(input({ scripts: { count: 2, held: false } })).facts).toBe("2 scripts trusted");
    expect(stripView(input({ socket: true, route: "bridge", paired: true })).route).toBe("From this page");
  });

  it("has a stop for a request with no address yet", () => {
    expect(stripView(input({ host: "" })).host).toBe("No address yet");
    expect(stripView(input({ host: "" })).hasHost).toBe(false);
    expect(stripView(input({ host: "" })).text).toBe("From this page. No address yet.");
  });
});

describe("the strip after a send", () => {
  it("says the route taken and the secrets that went, masked where they are kept", () => {
    const view = stripView(input({ record: record({ secrets: [{ name: "a" }, { name: "b" }] }) }));
    expect(view.sent).toBe(true);
    expect(view.route).toBe("Sent from this page");
    expect(view.secrets).toBe("2 secrets sent, masked in history and exports");
    expect(view.text).toBe(
      "Sent from this page. 200 OK, 340 ms. GET api.example.com. 2 secrets sent, masked in history and exports.",
    );
  });

  it("says the bridge, and when auto went there after the page got no answer", () => {
    expect(stripView(input({ route: "bridge", record: record({ route: "bridge" }) })).route).toBe(
      "Sent through the Local Bridge",
    );
    expect(stripView(input({ route: "auto", record: record({ route: "bridge" }) })).route).toBe(
      "Sent through the Local Bridge after the page got no answer",
    );
  });

  it("@claim:C-100 a send that got no response is a broken path, and says how far it got", () => {
    const failed = (kind: "network" | "timeout" | "aborted" | "bridge", over: Partial<ExchangeRecord> = {}) =>
      stripView(
        input({
          record: record({
            status: undefined,
            failure: { kind, reported: "Failed to fetch", summary: "The request got no response." },
            ...over,
          }),
        }),
      );
    const view = failed("network");
    expect(view.broken).toBe(true);
    expect(view.route).toBe("Not delivered: tried from this page");
    expect(view.secrets).toBe("");
    expect(view.text).toBe("Not delivered: tried from this page. The request got no response. GET api.example.com.");
    expect(failed("timeout").route).toBe("No answer: tried from this page");
    expect(failed("aborted").route).toBe("Stopped: tried from this page");
    expect(failed("bridge", { route: "bridge" }).route).toBe("Not delivered: tried through the Local Bridge");
  });

  it("a reply of any status is a whole path: the request reached the host", () => {
    for (const code of [200, 404, 500]) {
      const view = stripView(input({ record: record({ status: { code, text: "x" } }) }));
      expect(view.broken).toBe(false);
      expect(view.route).toBe("Sent from this page");
    }
    expect(stripView(input()).broken).toBe(false);
  });
});

describe("the problem line", () => {
  it("is a hint for no address, a fault for the rest, and nothing for a good one", () => {
    expect(addressProblem("", false, [])).toEqual({ kind: "empty", text: "Enter an address to send." });
    expect(addressProblem("{{base}}/x", false, ["base"], "Staging")).toEqual({
      kind: "missing",
      text: '{{base}} has no value in environment "Staging". Set a value.',
    });
    expect(addressProblem("{{base}}/x", false, ["base"])?.text).toBe("{{base}} has no value. Set a value.");
    expect(addressProblem("not a url", false, [])).toEqual({
      kind: "address",
      text: "Not an address. Write it as https://host/path.",
    });
    expect(addressProblem("https://api.example.com", true, [])).toBeNull();
  });

  it("@claim:C-107 offers to import a cURL command typed into the address, and to split a method from its address", () => {
    expect(addressProblem("curl -X POST https://api.example.com/pets", false, [])).toEqual({
      kind: "address",
      text: "This looks like a cURL command. Import it.",
      offer: { kind: "curl", label: "Import as request" },
    });
    expect(addressProblem("post https://api.example.com/pets", false, [])).toEqual({
      kind: "address",
      text: "Use POST for https://api.example.com/pets?",
      offer: { kind: "method", label: "Use it", method: "POST", address: "https://api.example.com/pets" },
    });
    expect(addressProblem("GET {{base}}/pets", false, [])?.offer).toMatchObject({
      method: "GET",
      address: "{{base}}/pets",
    });
    // Not offers: a word that is no method, an address with a space in it, a plain address.
    expect(addressProblem("FETCH https://api.example.com", false, [])?.offer).toBeUndefined();
    expect(addressProblem("GET https://api.example.com/a b", false, [])?.offer).toBeUndefined();
    expect(addressProblem("https://api.example.com/curl", true, [])).toBeNull();
  });
});
