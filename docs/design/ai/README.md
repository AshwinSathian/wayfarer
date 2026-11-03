# AI flows (D4.10)

Task D4.10 of [the design plan](../../../PLAN-design.md): the flows that
carry out [the AI decision](../ai.md) (D1.7). Designed, not built. Read
against `main` at `8e42176`. Every string follows [`voice.md`](../voice.md);
every place follows [`ia.md`](../ia.md).

| Flow | Spec | Prototype |
|---|---|---|
| Setting up a provider in Settings › AI | [setup.md](setup.md) | [prototypes/setup.html](prototypes/setup.html) |
| The preview of a model call, and its record after | [preview.md](preview.md) | [prototypes/preview.html](prototypes/preview.html) |
| The three actions: write tests, draft a request, explain a failed response; the proposal, Accept and Undo | [actions.md](actions.md) | [prototypes/actions.html](prototypes/actions.html) |
| The log: model calls in history, filtered, exported | [log.md](log.md) | [prototypes/log.html](prototypes/log.html) |

A prototype is one static HTML file: open it in a browser, and step through
it with its buttons. Each draws the light or dark theme by the system's
choice. They show places and words, not pixels: the build follows the
design tokens, not the prototypes' copies of them.

## The flows in one page

1. **Off until set up.** With no provider, no AI control is drawn
   anywhere, the palette has no AI command, and no request goes to a
   model. Settings › AI is the one place that mentions AI, and its empty
   state offers Add a provider.
2. **Setup.** A provider is an OpenAI-compatible endpoint or Anthropic's
   Messages API: its address, its model's name, a key kept as a vault
   secret (none for a model on this machine), a route, and which of the
   three actions may be offered. Test the provider sends a call of a few
   bytes, previewed like any other.
3. **An action is asked for** where its subject is: Write tests from this
   response in the response's Tests tab; Draft a request from a
   description in the empty response's offer and the palette; Explain
   this response in the exchange record of a response whose status is 400
   or more. Each also has a palette command.
4. **The preview.** Before anything leaves, the model call's preview shows
   where it goes, by which route, with which key (as ***), which parts of
   the request and the response are in the prompt, what the Redactor
   masked, and the request's body byte for byte. A response body is in it
   only when its tick is ticked, and the tick starts unticked every time.
   Send to model, or Cancel.
5. **The record.** After the call, the preview's band becomes the
   exchange record of the model call, in the same sentences a send's
   record has (`recordLines`), and the call is a history entry of its own
   kind.
6. **The proposal.** What the model answered is shown as a proposal: a
   diff against the post-response script, or against the request. It
   changes nothing. Accept writes it into the open tab's draft; Undo
   beside the line that says what changed puts the draft back. An
   explanation is text, and has nothing to accept.
7. **The log.** History lists model calls with requests, filtered by
   Requests and Model calls; each opens into its record and its prompt.
   HAR export carries them, masked as history keeps them.

## How the flows share the exchange record

The exchange record ([`ia.md`](../ia.md#the-signature-element-the-exchange-record))
has two forms: the preview under the address before Send, and the record
under the status line after it. A model call uses both, with no third
form:

| Record's part | A send | A model call |
|---|---|---|
| Where it goes | "Sends to {address}" under the address | "Sends to {address}" at the top of the preview, the provider's endpoint |
| What fills it | Variable chips: holder, value or *** | The prompt's parts: the request as sent, the response's status and headers, the response body (ticked), the script, the description |
| Secrets | A vault secret as *** in the address and the chips | The provider's key as ***; a secret the request used is *** in the prompt, as history keeps it |
| After | `recordLines`: route, secrets, masked, kept, failure | The same `recordLines`, with the key named as the vault secret filled |
| Kept | A history entry with `record` | A history entry of kind "model call" with `record` |

The model call's record is built by the same `exchange`-side code that
builds a send's (`ExchangeRecord`, `packages/core/src/send/record.ts`): it
needs no field the record lacks today except the action's name, which the
history entry holds, not the record. What the prompt quotes from a send is
taken from what history keeps of that send, after the Redactor, so the
prompt holds nothing history would not.

## Principles

- **Nothing leaves that was not shown.** The preview's body text is the
  body sent, byte for byte. The headers are shown as sent, the key as ***.
  Ticking or unticking a part redraws the bytes and the size before Send.
- **The prompt is made from what is kept, not from what was sent.** It
  is built from the masked exchange (the form history keeps), so a vault
  secret, a credential and a cookie value are *** in it, whatever the
  model is.
- **Nothing in a prompt is a template, and nothing in an answer is.** A
  `{{name}}` in a description, a request or a response goes as written:
  the resolver is never run over a prompt. A proposal that names a vault
  secret (`{{$secret.…}}`) is refused before it is drawn.
- **The answer is a server's text.** It is shown as text, never as HTML
  or Markdown rendered, and in monospace, the face of what the wire
  carried (voice.md's type split). A proposal is validated as an imported
  file is (`validateRequestContent`, `isHttpMethod`).
- **Accepting is the review.** A proposed script is not in the draft until
  Accept. Once accepted it is text the person put there, as if typed:
  `ScriptTrust` checks the stored text a draft was loaded from, never the
  draft, so the script runs at the next send of a request whose scripts
  may run, and a save from the composer approves its digest. Accept adds
  no caller of `approveScripts`.
- **One place per action, and the palette as the second road**
  (`ia.md`'s rule 4).
- **No model call is made by anything but a person's Send to model.**
  Not on load, not on a send, not in a run, not by a script.

## Decisions a reviewer should check

1. The preview of a Draft is in a dialog; the previews of Write tests and
   Explain are in place (the Tests tab, the record's band). A draft has no
   response to sit beside, and its description needs a field.
2. ⌘↵ or Ctrl+Enter never sends a model call: it stays the request's
   Send. Send to model is reached by Tab and Enter, or a click.
3. With Keep response bodies in history off, a model call's kept prompt
   leaves out the response body it quoted, and its record says so (a new
   sentence of `recordLines`; see [log.md](log.md)). Otherwise the setting
   would be bypassed through the prompt.
4. A proposed script that calls `pm.sendRequest` or `require` is marked
   in the diff, with the line, before Accept.
5. The Undo of an accepted proposal stays until that part of the draft
   changes again, the tab closes or another proposal is accepted, not for
   a few seconds: a person reads a script before deciding it was wrong.

## Open questions, each with a recommended default

| Question | Recommended default |
|---|---|
| One provider or several? | One. A second provider is a later change; the setting is a list of one so it can grow without a new shape. |
| Are the three actions ticked when a provider is added? | Yes. Adding a provider is the consent to be offered them; the preview is the consent for each call. Each can be unticked. |
| How much of a response body goes into a prompt? | The first 16 kB of the body as kept, cut at a character, the preview saying "the first 16 kB of 48.2 kB". |
| How long is a model call given? | 120 s, not the request timeout: a model on a laptop takes longer than an API. Stop is always there. |
| Does a model call count against History size? | Yes, as one entry, with the requests. A separate cap adds a setting for little. |
| May a team set a provider for everyone? | Not now; Phase T, as `ai.md` says. |
| May a run or the CLI call a model? | No. A run sends nothing a person did not compose, and the CLI's MCP server is `ai.md`'s action 4, not D4.10. |
| Should the explanation propose a change? | No. It is text; a person who wants a change asks for a draft or tests. One action, one kind of answer. |
| Are the model's answers streamed? | No. The preview promised one request and one answer; a stream adds a reader for each provider's format and nothing a person needs before the answer is whole. |

## Claims

Each spec lists the claims its flow adds, as testable sentences with the
test that would prove each. `ai.md`'s five are AI-1 to AI-5; the specs add
AI-6 onward. Built, AI-1 to AI-15 are C-069 to C-083 in `docs/claims.md`,
in the same order; `docs/ai.md` is the user's page for them.

| Id | Claim | In |
|---|---|---|
| AI-1 | No request goes to a model until a provider is set up. | [setup.md](setup.md) |
| AI-2 | A prompt never holds a vault secret's plaintext, a credential or a cookie value. | [preview.md](preview.md) |
| AI-3 | What is sent to a model is shown before it is sent, byte for byte. | [preview.md](preview.md) |
| AI-4 | A response body is sent to a model only when ticked for that call. | [preview.md](preview.md) |
| AI-5 | A model's proposal changes nothing until accepted, and Undo restores the request as it was. | [actions.md](actions.md) |
| AI-6 | The provider's key is kept only as a vault secret. | [setup.md](setup.md) |
| AI-7 | Removing the provider deletes its key from the vault and draws no AI control again. | [setup.md](setup.md) |
| AI-8 | A prompt is never a template: `{{name}}` in it goes as written. | [preview.md](preview.md) |
| AI-9 | A prompt that names a vault secret's reference is not sent. | [preview.md](preview.md) |
| AI-10 | A proposal that names a vault secret's reference is refused. | [actions.md](actions.md) |
| AI-11 | An accepted script runs only where the request's scripts may run; accepting lifts no hold. | [actions.md](actions.md) |
| AI-12 | No model call is made but by Send to model. | [actions.md](actions.md) |
| AI-13 | Each model call is a history entry with its record, and is masked there as a send is. | [log.md](log.md) |
| AI-14 | With response bodies off in history, a model call's kept prompt holds no response body. | [log.md](log.md) |
| AI-15 | A HAR export of model calls holds no key and nothing history masked. | [log.md](log.md) |

## What the code does not confirm (unverified)

- No `UndoNotice` exists on `main` at `8e42176`, and U-080's undo model is
  not built. The Undo of a proposal is designed here on its own; when
  U-080's line is built, the proposal's Undo is drawn with it.
- Whether each provider answers a page's request with CORS headers: an
  Ollama server allows only its own origins unless `OLLAMA_ORIGINS` says
  otherwise, and Anthropic's API asks a browser's request to carry
  `anthropic-dangerous-direct-browser-access: true`. Both are the
  providers' documentation as remembered, not measured here. The route
  covers either case: a call the page cannot make goes through the Local
  Bridge.
- Whether `ai.md`'s statement that the record names a 401's cause holds:
  it does not today (`recordLines` names no cause for any status). Explain is
  offered for every status of 400 or more until the record does.
