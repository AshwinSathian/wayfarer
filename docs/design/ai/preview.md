# The preview of a model call, and its record

Part of [the AI flows](README.md). Prototype:
[prototypes/preview.html](prototypes/preview.html).

Every model call, the provider's test included, is shown in this preview
before it is sent, and becomes this record after. It is one component
(`app-model-call` in the build), drawn where its action was asked: under
Test the provider… in Settings › AI, in the response's Tests tab, in the
exchange record's band, in the Draft a request dialog
([actions.md](actions.md) places each).

## How the prompt is made

1. The action names its parts (the table below). Each part is taken from
   the masked exchange: the form history keeps, after the Redactor, with
   every vault secret, every credential (`BuiltRequest.credentials`) and
   every cookie value as `***`. The prompt reads the tab's response as
   the Redactor gives it to history, whether or not history keeps its
   body.
2. The parts are written into the provider's request body, as JSON with
   two spaces of indent. That text is what the preview shows and what is
   sent: no step changes it after the preview.
3. The text is checked with `containsSecretPlaceholder` (C-007). A prompt
   that holds `{{$secret.…}}` (a person may type one into a description)
   is not sent; the preview says so.
4. Nothing in the prompt goes through the resolver. `{{baseUrl}}` in a
   description or in a request's template goes as written.
5. The provider's key is filled in last, as a header, from the vault; it
   is in `BuiltRequest.secrets`, so the record masks it and history keeps
   `***`.
6. The call goes through `TransportRouter.send` with the provider's route
   (`routeOf` with the AI setting's route as the request's own), and with
   `cache: "no-store"`, `credentials: "omit"` and
   `referrerPolicy: "no-referrer"`, as every request does.

### The parts of a prompt

| Part | Write tests | Draft a request | Explain | Test |
|---|---|---|---|---|
| The instruction (fixed text, the app's) | yes | yes | yes | yes |
| The request as sent: method, address, headers, body | yes | — | yes | — |
| The response's status and headers | yes | — | yes | — |
| The response body | tick, unticked | — | tick, unticked | — |
| The request's post-response script | yes | — | — | — |
| The description typed | — | yes | — | — |
| The names of the variables in use (names, no values) | — | tick, ticked | — | — |

A request body or a response body that is not text (a file, an image,
bytes) is never a part: the row says "The response body is not text, and
cannot go into a prompt." with no tick. A text body over 16 kB goes in
cut: "The first 16 kB of the response body, of 48.2 kB."

## What the preview shows, top to bottom

Shown in the light of a Write tests call on `GET /pets`:

> **Ask the model to write tests**
>
> Sends to `https://api.openai.com/v1/chat/completions`
> Provider: OpenAI-compatible, model `gpt-4.1-mini`
> Route: auto. From this page; the Local Bridge only if the page gets no
> response and you agree.
> Key: `AI provider key`, from the vault. It is *** below and in what is
> kept.
>
> **In the prompt**
> ✓ The request as sent: `GET`, its address, 3 headers
> ✓ The response's status and 6 headers
> ☐ The response body, 3.1 kB of JSON
> ✓ The post-response script, 4 lines
>
> Masked with *** before it leaves: `Authorization`, `Cookie` of the
> request, `Set-Cookie` of the response.
>
> **What is sent** · 2.4 kB
>
> ```text
> POST https://api.openai.com/v1/chat/completions
> Content-Type: application/json
> Authorization: Bearer ***
>
> {
>   "model": "gpt-4.1-mini",
>   "messages": [
>     { "role": "system", "content": "You write Postman-style tests…" },
>     { "role": "user", "content": "Request:\nGET https://api.example.com/pets\n…" }
>   ]
> }
> ```
>
> [Cancel] [Send to model]

- **The heading** is the action's name: "Ask the model to write tests",
  "Ask the model to draft a request", "Ask the model to explain this
  response", "Test the provider".
- **Sends to** is the full address of the call, monospace, wrapping.
- **Route** says the route the setting names: "Route: direct. From this
  page." / "Route: Local Bridge. Through the Local Bridge on this machine."
  / the auto sentence above.
- **Key**: with none, "No key is sent."
- **In the prompt** lists each part of the table, with what it holds in
  numbers. Fixed parts are a tick drawn as text (✓, `aria-hidden`), not a
  control; a part with a tick is a `uiCheckbox` with its label. The tick
  for the response body starts unticked every time the preview opens,
  whatever the last call chose.
- **Masked** lists what the Redactor put *** in, as the record's masked
  sentence does: header names in monospace, "the address", "the body",
  "the response body". With nothing: "Nothing was masked."
- **What is sent** is the request line, the headers as sent with the key
  as ***, a blank line and the body, in monospace, in a box that scrolls
  vertically at 24 lines (it never scrolls sideways: lines wrap). Its size
  is the body's bytes ("2.4 kB"). Ticking a part redraws the text and the
  size at once. The box is a `<pre>` with `tabindex="0"` and
  `aria-label="What is sent"`, so the keyboard can scroll it.
- **Buttons**: Cancel (text) and Send to model (filled), the action on
  the right. Cancel closes the preview and sends nothing.

### Words a preview may also show

| When | Words, above the buttons | Send to model |
|---|---|---|
| The vault is locked and a key is needed | "The key is in the vault, which is locked. Send to model asks you to unlock it." | Enabled; it asks for the passphrase (`ensureUnlocked`), then sends |
| The prompt names a vault secret's reference | "The description names a vault secret (`{{$secret.…}}`), which never leaves this browser. Take it out to send." | Disabled |
| The prompt is over the app's limit (128 kB) | "A prompt can be 128 kB at most. This one is 141 kB: untick the response body, or shorten the description." | Disabled |
| The action's subject is gone (the tab's response was replaced) | "The response this was about has changed. Close this and ask again." | Disabled |

## Sending

Send to model becomes "Stop" (outlined) while the call is on its way, and
the status region says "Asking the model…". Stop aborts the call
(`AbortSignal`); the record then says the call was stopped, as a send's
does. The call is given 120 s (an open question in [README.md](README.md)).

## The record, after

The preview's band becomes the record, in place. Its first line is the
status line's words, from `recordHeadline`; its sentences are
`recordLines` with keeper "history":

> **200 OK, 2,310 ms, Direct to api.openai.com**
> Sent from this page to `api.openai.com`.
> Filled from the vault: `AI provider key`. Each is *** in what is kept.
> Masked with *** in what is kept: `Authorization`.
> History kept the request and the response.
>
> [Show what was sent]

- "Show what was sent" opens the same box the preview had, as kept.
- `formatMs` writes "2310 ms" today (no thousands comma); voice.md asks
  for "2,310 ms". The build changes `formatMs` for both records, or this
  stays as it is for sends too.
- The answer, or the proposal made from it, comes under the record
  ([actions.md](actions.md)). On a failure the record is all there is,
  with the record's own offer.

### Failures

The record's sentences are the send's. What the app adds is one sentence
above the record, and one action:

| What happened | Sentence | Action |
|---|---|---|
| No response | The record's headline ("The request got no response. Direct to localhost:11434, no bridge paired.") | The record's: Send through the Local Bridge, or its setup in place |
| 401, 403 | "`api.openai.com` refused the key: 401 Unauthorized." | "Change key" (opens Settings › AI) |
| 429 | "`api.openai.com` asked to wait: 429 Too Many Requests." and, if sent, "It said to try again after 20 s." from `Retry-After` | "Send again" |
| Another status | "`api.openai.com` answered 500 Internal Server Error." | "Send again" |
| Stopped | "Stopped. No answer was kept." | "Send again" |
| Timed out | "No answer came in 120 s." | "Send again" |

Under the sentence, the provider's own message (its JSON's `error.message`
when it has one, else the first 500 characters of the body), in
monospace, quoted as it came. Send again reopens the preview with the same
parts, the response body unticked again.

## Keyboard and screen reader

- The preview opens with focus on its heading (`tabindex="-1"`), which a
  screen reader reads with the region's name: "Ask the model to write
  tests, region". Tab then reaches the ticks, the "What is sent" box,
  Cancel, Send to model. Escape is Cancel, unless a tick or the box had a
  key of its own.
- ⌘↵ or Ctrl+Enter is not Send to model: it stays the request's Send, and
  a person who pressed it out of habit would send to a model unseen.
- Each tick's label holds its size: "The response body, 3.1 kB of JSON,
  checkbox, not checked". Ticking it updates the size, which the status
  region does not announce (it would on every tick); the box's label
  gains it: "What is sent, 5.5 kB".
- On send, the status region says "Asking the model…"; when the call
  ends, the record's first line, then focus moves to the answer's heading
  (or the failure's sentence).

## At 390 px

The preview is the full width of the response pane or the dialog. The
"What is sent" box wraps every line (`white-space: pre-wrap`,
`overflow-wrap: anywhere`) and is capped at 24 lines' height, scrolling
vertically. The buttons share one row, Send to model on the right; at
320 px each is still 44 px tall and neither is cut.

## Claims this flow adds

| Id | Claim | Test that would prove it |
|---|---|---|
| AI-2 | A prompt never holds a vault secret's plaintext, a credential or a cookie value. | Unit (core): the prompt builder over a masked exchange with a vault secret, a Basic header, a cookie and a secret inside a JSON body finds none of their texts, in any encoding the Redactor knows. e2e: `secrets-wire.spec.ts`'s scan extended to the mock model's received bodies. |
| AI-3 | What is sent to a model is shown before it is sent, byte for byte. | e2e: the "What is sent" box's body text equals the body the mock model received, for each action and the test, ticked and not. |
| AI-4 | A response body is sent to a model only when ticked for that call. | e2e: two calls on one response, ticked in the first; the mock receives the body once; the tick is unticked when the second preview opens. |
| AI-8 | A prompt is never a template: `{{name}}` in it goes as written. | e2e: a description with `{{baseUrl}}`, with `baseUrl` set; the mock receives `{{baseUrl}}`. |
| AI-9 | A prompt that names a vault secret's reference is not sent. | e2e: a description holding `{{$secret.x}}`; Send to model is disabled and the mock receives nothing. Unit: `containsSecretPlaceholder` runs on the prompt. |
