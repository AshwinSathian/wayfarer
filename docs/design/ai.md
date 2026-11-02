# Decision: the shape of AI in Wayfarer (D1.7)

> Status: decided 2026-11-02, under the maintainer's standing instruction of
> that day to review each blocked decision adversarially, decide and go on
> (plan row 1.55). Feeds D4.10 (session D4-k).

## The question

What does AI do in Wayfarer, which models may it use, and how is each byte
that leaves shown? The plan's non-goals rule out AI on by default and any
call the user did not set up. Wayfarer's promise is that nothing leaves
without the user seeing where it goes (the exchange record, D4.12).

## What is fixed

Measured in this repository's Playwright engines on 2026-11-02 (Chromium
156, Firefox 157, WebKit 27.2), on a page served from localhost:

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| Prompt API (`LanguageModel`) | present | absent | absent |
| WebMCP (`navigator.modelContext`) | absent | absent | absent |

The Prompt API's model is a download of several gigabytes that needs a
large GPU (research-2026 section 8); WebMCP is a proposal behind an origin
trial. A model reached with the user's key is a request like any other:
`FetchTransport` can send it, the redactor can mask it, the exchange
record can show it.

## Options, each argued against

- **What it does.**
  1. *Draft a request from a description.* Against: a pasted cURL command
     already does this better for most users; the model guesses hosts and
     headers. For it: the empty composer is the first-run problem (D4.2).
  2. *Write tests from a response.* Against: a model sees a response body,
     which may be personal data. For it: `pm.test` is the step people
     skip, and the result is code they can read before it runs.
  3. *Explain a failure.* Against: the exchange record (D4.12) already
     names the cause for CORS, DNS and 401 without a model; a model adds
     prose people skim (research-2026 section 8, Nielsen Norman's
     reported findings). For it: the long tail (a 422's body, a signing
     error).
  4. *Be driven by the user's agent* (MCP or WebMCP). Against, now: WebMCP
     is in no engine by default; an MCP server needs a process, which is
     the CLI's or the bridge's, and the bridge runs no other program.
- **Which models.** The user's key for a hosted model (sent from the
  page); a local model (Ollama, LM Studio, any OpenAI-compatible server
  on localhost); Chrome's Prompt API. Against the Prompt API: one engine,
  a silent multi-gigabyte download, and a model too small for the tasks
  above. Against hosted keys: the key must be kept, and the prompt leaves
  the machine.

## Decision

- **Off until set up.** No AI control is shown as usable, and no request
  to a model is made, until the user adds a provider in Settings › AI.
- **Providers:** an OpenAI-compatible endpoint (which covers OpenAI,
  Ollama, LM Studio and most gateways) and Anthropic's Messages API. The
  key is a vault secret and the provider's address a plain setting; a
  local model needs no key. Requests go through `TransportRouter`, so a
  local model that sends no CORS headers is reached through the Local
  Bridge like any other server. **Not now:** the Prompt API (one engine,
  a silent download) and WebMCP (in no engine); each is revisited when
  it ships in a second engine.
- **Actions, in this order:** (2) write tests from a response, (1) draft
  a request from a description, (3) explain a failure, offered only when
  the exchange record names no cause. (4) waits for the CLI, where an MCP
  server belongs (a process the user starts, with the CLI's own
  permissions), and is not part of D4.10.
- **What leaves is shown before it leaves.** Every model call is an
  exchange: before it is sent, a preview in the same record (the address,
  the provider, the exact prompt text, which parts of the request or
  response it includes), and Send; after it, the record (route, host,
  what was kept). The prompt is built after the Redactor: a vault
  secret, a credential (`BuiltRequest.credentials`) and a cookie value
  are masked in it, so a model is never sent what history would not keep.
  A response body goes into a prompt only when the user ticks it in that
  preview, each time.
- **Nothing changes until accepted.** A model's answer is a proposal
  shown as a diff against the request or the script; Accept writes it
  and Undo takes it back. A proposed script is unapproved until accepted
  (`ScriptTrust`): accepting it is the review.
- **A log.** Each model call is a history entry of its own kind, with its
  record, so the user can see what was sent to which provider and when.

## Claims it adds (each with the test that will prove it)

1. No request goes to a model until a provider is set up (e2e: every AI
   control with no provider; zero requests to any host but the echo
   server's).
2. A prompt never holds a vault secret's plaintext, a credential or a
   cookie value (unit in core over the prompt builder; and the
   secrets-wire e2e scan extended to a model call).
3. What is sent to a model is shown before it is sent, byte for byte
   (e2e: the preview's text equals the request body the mock model
   received).
4. A response body is sent to a model only when ticked for that call
   (e2e: two calls, ticked once; the mock receives it once).
5. A model's proposal changes nothing until accepted, and Undo restores
   the request as it was (e2e).

## What this does not decide

The wording and the place of each control (D4.10's design), and whether a
team may set a provider for everyone (Phase T).
