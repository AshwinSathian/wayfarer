import { describe, expect, it } from "vitest";
import type { PastRequest } from "../send/exchange";
import {
  PROMPT_BODY_CHARS,
  answerText,
  draftPrompt,
  explainPrompt,
  keyHeader,
  modelEndpoint,
  modelRequest,
  promptNamesSecret,
  providerMessage,
  requestProposal,
  scriptProposal,
  testsPrompt,
  type AiProvider,
} from "./model-call";

const openai: AiProvider = { kind: "openai", address: "http://localhost:11434/v1/", model: "llama3.2" };
const anthropic: AiProvider = { kind: "anthropic", address: "https://api.anthropic.com", model: "claude-x" };

/** An exchange as history keeps it: the Redactor has put *** where a secret, a credential or a cookie was. */
const kept: PastRequest = {
  createdAt: 1,
  template: {
    method: "GET",
    url: "{{base}}/pets",
    params: [],
    headers: [],
    body: { mode: "none" },
    auth: { type: "none" },
    scripts: { pre: "", post: "" },
    tests: [],
    settings: {},
  },
  sent: {
    method: "GET",
    url: "https://api.test/pets?token=***",
    headers: [
      ["Authorization", "Basic ***"],
      ["Cookie", "sid=***"],
    ],
  },
  response: {
    status: 200,
    statusText: "OK",
    headers: [["Set-Cookie", "sid=***"]],
    body: { text: '{"pets":[],"echo":"***"}', truncated: false },
  },
  route: "direct",
};

describe("a model call (D4.10)", () => {
  it("goes to each API's address, its body the JSON the preview shows", () => {
    expect(modelEndpoint(openai)).toBe("http://localhost:11434/v1/chat/completions");
    expect(modelEndpoint(anthropic)).toBe("https://api.anthropic.com/v1/messages");
    const call = modelRequest(openai, { system: "S", user: "U" }, 8);
    expect(JSON.parse(call.body)).toEqual({
      model: "llama3.2",
      max_tokens: 8,
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: "U" },
      ],
    });
    expect(call.body).toBe(JSON.stringify(JSON.parse(call.body), null, 2));
    expect(JSON.parse(modelRequest(anthropic, { system: "S", user: "U" }).body)).toMatchObject({
      system: "S",
      messages: [{ role: "user", content: "U" }],
    });
    expect(modelRequest(anthropic, { system: "", user: "U" }).headers).toContainEqual([
      "anthropic-version",
      "2023-06-01",
    ]);
    expect(keyHeader(openai, "k")).toEqual(["Authorization", "Bearer k"]);
    expect(keyHeader(anthropic, "k")).toEqual(["x-api-key", "k"]);
  });

  // AI-2: the prompt is made from what history keeps, so it holds *** where the exchange held a secret.
  it("quotes the exchange as history keeps it, the response body only when ticked", () => {
    const without = testsPrompt(kept, "", false).user;
    expect(without).toContain("GET https://api.test/pets?token=***");
    expect(without).toContain("Authorization: Basic ***");
    expect(without).toContain("Set-Cookie: sid=***");
    expect(without).not.toContain('"pets"');
    expect(testsPrompt(kept, "", true).user).toContain('{"pets":[],"echo":"***"}');
    expect(explainPrompt(kept, false).user).not.toContain('"pets"');
  });

  // AI-8: nothing in a prompt is resolved.
  it("sends {{name}} as written", () => {
    expect(draftPrompt("Get {{baseUrl}}/pets", ["baseUrl"]).user).toBe(
      "Get {{baseUrl}}/pets\n\nVariables that have values: baseUrl.",
    );
  });

  // AI-9: a prompt that names a vault secret's reference is not sent.
  it("finds a vault secret's reference in the prompt, as the wire check does", () => {
    const call = modelRequest(openai, draftPrompt("use {{$secret.abc}}"));
    expect(promptNamesSecret(call)).toBe(true);
    expect(promptNamesSecret(modelRequest(openai, draftPrompt("use {{token}}")))).toBe(false);
  });

  it("cuts a long response body to 16 kB", () => {
    const long = {
      ...kept,
      response: { ...kept.response!, body: { text: "x".repeat(PROMPT_BODY_CHARS + 10), truncated: false } },
    };
    expect(testsPrompt(long, "", true).user).toContain("x".repeat(PROMPT_BODY_CHARS));
    expect(testsPrompt(long, "", true).user).not.toContain("x".repeat(PROMPT_BODY_CHARS + 1));
  });

  it("reads each API's answer, and none from a body that has none", () => {
    expect(answerText("openai", JSON.stringify({ choices: [{ message: { content: "OK" } }] }))).toBe("OK");
    expect(
      answerText(
        "anthropic",
        JSON.stringify({
          content: [
            { type: "text", text: "O" },
            { type: "text", text: "K" },
          ],
        }),
      ),
    ).toBe("OK");
    expect(answerText("openai", JSON.stringify({ choices: [{ message: { content: "  " } }] }))).toBeUndefined();
    expect(answerText("openai", "<html>")).toBeUndefined();
    expect(providerMessage(JSON.stringify({ error: { message: "bad key" } }))).toBe("bad key");
    expect(providerMessage("plain")).toBe("plain");
  });

  // AI-10: a proposal that names a vault secret's reference is refused; a request proposal is checked as an import.
  it("makes a proposal of an answer, and refuses one that names a vault secret or is no request", () => {
    expect(scriptProposal("Here:\n```js\npm.test('ok', () => {});\n```")).toEqual({
      script: "pm.test('ok', () => {});",
    });
    expect(scriptProposal("```js\npm.environment.set('t', '{{$secret.x}}');\n```")).toHaveProperty("refused");
    const proposed = requestProposal(
      '{"method": "post", "url": "{{base}}/pets", "headers": [["Accept", "application/json"]], "body": "{}"}',
    );
    expect(proposed).toMatchObject({
      request: {
        method: "POST",
        url: "{{base}}/pets",
        headers: [{ key: "Accept", value: "application/json", enabled: true }],
      },
    });
    expect(requestProposal('{"method": "GET", "url": "{{$secret.x}}"}')).toHaveProperty("refused");
    expect(requestProposal('{"method": "G E T", "url": "https://x"}')).toHaveProperty("refused");
    expect(requestProposal("no json here")).toHaveProperty("refused");
  });
});
