import { describe, expect, it } from "vitest";
import { TransportError, type ResponseEnvelope } from "../transport/transport";
import { keptModelCall } from "./call";
import { modelRequest, type AiProvider } from "./model-call";

const KEY = "sk-live-0123456789abcdef";
const provider: AiProvider = { kind: "openai", address: "https://api.test/v1", model: "m-1" };
const request = modelRequest(provider, { system: "S", user: 'Response:\n200 OK\n\n{"pets":[]}' });
const envelope = (status: number, body: string): ResponseEnvelope => ({
  status,
  statusText: status === 200 ? "OK" : "Unauthorized",
  headers: [["content-type", "application/json"]],
  body: new TextEncoder().encode(body).buffer as ArrayBuffer,
  redirected: false,
  finalUrl: "https://api.test/v1/chat/completions",
  route: "direct",
  sizes: { decoded: body.length },
});
const call = (outcome: ResponseEnvelope | TransportError, keepBodies = true, quotesResponseBody = false) =>
  keptModelCall({
    provider,
    action: "tests",
    request,
    key: KEY,
    keyName: "AI provider key",
    outcome,
    durationMs: 120,
    route: "direct",
    unpaired: false,
    keepBodies,
    quotesResponseBody,
    createdAt: 5,
  });

describe("a model call as history keeps it (D4.10)", () => {
  // AI-13: masked as a send is; the key is in no field as itself, and the record names the vault secret.
  it("keeps the call with its record, the key *** everywhere, the answer read", () => {
    const echoed = JSON.stringify({ choices: [{ message: { content: `Here, and the key was ${KEY}` } }] });
    const { history, answer } = call(envelope(200, echoed));
    expect(JSON.stringify(history)).not.toContain(KEY);
    expect(history.sent.headers).toContainEqual(["Authorization", "***"]);
    expect(history.model).toEqual({ action: "tests", model: "m-1" });
    expect(history.record).toMatchObject({
      status: { code: 200, text: "OK" },
      host: "api.test",
      secrets: [{ name: "AI provider key" }],
      masked: { headers: ["Authorization"], responseBody: true },
      kept: { response: true, body: true },
    });
    expect(answer).toBe("Here, and the key was ***");
    expect(history.sent.bodyPreview).toBe(request.body);
  });

  // AI-14: with response bodies off in history, a prompt that quoted one is not kept, nor the answer's body.
  it("keeps no prompt that quoted a response body when history keeps no bodies", () => {
    const { history } = call(envelope(200, JSON.stringify({ choices: [{ message: { content: "OK" } }] })), false, true);
    expect(history.sent.bodyPreview).toBeUndefined();
    expect(history.template.body).toEqual({ mode: "none" });
    expect(history.response?.body).toBeUndefined();
    expect(history.record?.kept).toEqual({ response: true, body: false });
  });

  it("says a provider's refusal in its own words, and a call with no response as the transport did", () => {
    expect(call(envelope(401, JSON.stringify({ error: { message: `bad key ${KEY}` } }))).problem).toBe("bad key ***");
    const failed = call(new TransportError("network", "Failed to fetch"));
    expect(failed.problem).toBe("Failed to fetch");
    expect(failed.history.response).toBeUndefined();
    expect(failed.history.record?.failure).toMatchObject({ kind: "network", reported: "Failed to fetch" });
  });
});
