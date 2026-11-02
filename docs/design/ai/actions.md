# The three actions

Part of [the AI flows](README.md). Prototype:
[prototypes/actions.html](prototypes/actions.html).

In `ai.md`'s order: write tests from a response, draft a request from a
description, explain a failed response. Each is drawn only when a provider
is saved and the action is ticked in Settings › AI. Each call goes through
[the preview](preview.md); this page says where each control is, what the
model is asked, what comes back, and what Accept and Undo do.

## Shared rules

- **Enabled and disabled.** A control is either drawn and enabled, or not
  drawn. With a provider and the action ticked, it is drawn; it is
  disabled only while a call of the same action is on its way in the same
  tab ("Asking the model…" as its tooltip on the wrapper). There is no
  disabled AI control in an app with no provider.
- **One call per tab at a time per action.** A second ask opens the same
  preview again.
- **A proposal is drawn under the record**, with a heading ("Proposed
  tests", "Proposed request"), the diff, a note of anything to read, and
  Accept (filled) and Discard (text). Discard closes it; the call stays in
  history.
- **Accept** writes into the open tab's draft, the tab the action was
  asked in (a send's rule: the tab is held from the first step, never
  `tabs.active()` at the end). If that tab was closed meanwhile, the
  proposal says "The tab this was for is closed." and Accept is not drawn.
- **Undo.** After Accept, the proposal is replaced by one line, in the
  place it was: "{What changed}. [Undo]". Undo puts back the field as it
  was before Accept (the whole field, kept in `TabState` with the line)
  and says "Put back as it was." The line and its Undo stay until that
  field of the draft changes again, the tab closes, or another proposal
  is accepted in it; then the line goes, with no announcement.
- **What the model answered is text.** It is never rendered as HTML or
  Markdown. A fenced code block is read out of the answer; everything else
  of the answer is shown under "The model also wrote:" in monospace,
  folded.
- **Nothing usable.** When the answer holds nothing the action can use,
  the proposal says what was missing and shows the whole answer:
  "The answer held no script.", "The answer held no request.", "The answer
  was empty.", with "Send again". When the provider stopped at its length
  limit (`finish_reason: "length"`, `stop_reason: "max_tokens"`): "The
  answer stopped at the model's length limit, so it may be incomplete."
  above the proposal, which is still offered.
- **A proposal that names a vault secret's reference is refused**:
  "The answer names a vault secret (`{{$secret.…}}`), which only you can
  place. It was not offered." The answer is shown, the diff is not.
- **No model call is made but by Send to model.** No send, run, script,
  import or page load calls a model.

## 1. Write tests from a response

**Where.** The response's Tests tab, at its head, once a response came:
"Write tests from this response…" (outlined, `btn-sm`). With no tests yet,
the tab's empty state reads "Tests you write run after each send, and
their results show here." with Write tests from this response… and
"Open the script" (Scripts tab, Post-response). Palette: "Write tests from
the response…", in the open tab's group, only while the tab has a
response.

**The model is asked** (fixed instruction, the app's, shown in the
preview): "Write tests for this exchange in Postman's `pm` script API:
`pm.test`, `pm.expect`, `pm.response`. Test the status, the headers that
matter, and the shape of the body if it is given. Do not repeat a test the
existing script has. Do not send requests. Reply with one JavaScript code
block and nothing else." Then the request as sent, the response's status
and headers, the body if ticked, and the post-response script.

**What comes back.** The first fenced block (`js`, `javascript` or none);
without fences, the whole answer if it is not empty.

**The proposal** is a diff of the post-response script: the current text
above, unchanged lines plain, the proposed lines added at its end, each
with `+` in the gutter and the added-line tint. The model's text is added,
never replacing what is there.

> **Proposed tests**
> Adds 4 tests to the post-response script, after its 4 lines.
>
> ```diff
>   pm.test("status is 200", () => {
>     pm.response.to.have.status(200);
>   });
>
> + pm.test("is a list of pets", () => {
> +   const body = pm.response.json();
> +   pm.expect(body).to.be.an("array");
> + });
> ```
>
> [Discard] [Accept]

- A count heads it: "Adds {n} tests" counts `pm.test(` in the added text
  ("Adds lines" when it finds none).
- **Read before you accept.** When the added text holds `pm.sendRequest`,
  `require(` or `pm.environment.set`, `pm.globals.set`,
  `pm.collectionVariables.set`, a note under the heading names each with
  its line: "This script sends a request of its own, on line 12." / "This
  script loads a library, on line 3." / "This script changes a variable,
  on line 7: `token`." It is a text search and misses what is written
  around it (`pm["send" + "Request"]`): the note says what it found, not
  that the rest is safe. The instruction asks for none of these.

**Accept** sets the draft's post-response script to the current text
plus the added lines. The line: "Added 4 tests to the post-response
script. [Undo] [Open the script]".

### Why accepting is the review

`ScriptTrust` decides whether a draft's scripts may run by the stored
text the draft was loaded from, never the draft: "what the user then types
into it is their own" (`src/app/services/script-trust.ts`). A proposal is
not in the draft until Accept, so it cannot run before it. Accept puts it
there as if the person typed it, after they read it in the diff: that read
is the review. Then:

- In a request typed here, or a saved request whose scripts may run, the
  accepted tests run at the next send. A save from the composer approves
  their digest, as it does for anything typed (one of the three callers of
  `approveScripts` CLAUDE.md lists; Accept adds none).
- In a saved request whose scripts are held (an imported collection not
  yet reviewed), Accept lifts no hold: the next send shows the review
  dialog, with the accepted text among the scripts to review.
- In a history entry's tab with held scripts, the same: held until
  reviewed.

## 2. Draft a request from a description

**Where.** The empty response's offer (D4.2: "Send a request and its
response shows here." with Paste a cURL command and Import a
collection…) gains a third button, "Describe a request…", when the action
is on. Palette: "Draft a request from a description…", always (with the
action on). Both open the Draft a request dialog (`ui-dialog`).

**The dialog, first step.**

> **Draft a request**
> Describe the request. The model drafts it; nothing is sent until you
> send it.
>
> Description `[textarea, font-sans]`
> e.g. "Create a pet named Rex, with the tag dog, on the Petstore API"
>
> ☑ The names of the variables in use: `baseUrl`, `petId`, `token` (no
> values)
>
> [Cancel] [Preview…]

The description is prose, so `font-sans`. Preview… (filled) is enabled
once the description holds text, and replaces the step with the preview
in the same dialog ([preview.md](preview.md)); its Cancel goes back to the
description, kept.

**The model is asked**: "Draft one HTTP request from this description.
Reply with one JSON code block holding `method`, `address`, `headers` (a
list of `[name, value]`) and `body` (text, or null). Use a variable as
`{{name}}` only from the names given. Do not invent credentials: leave a
header that needs one out." Then the description and the variable names,
if ticked.

**What comes back** is read as JSON from the first fenced block, then
validated as an imported request is: the method by `isHttpMethod`, every
field by `validateRequestContent`'s rules. A field that fails is dropped
and named: "Left out: the method `FETCH` is not an HTTP method." Nothing
usable is "The answer held no request." with the answer.

**The proposal** is the request, field by field, against the open tab's
draft: method, address, each header, body. A field that differs shows the
current value struck through and the proposed one under it; a field that
is the same is not listed. Every `{{name}}` in the proposal is drawn as a
variable chip ([`variable-chips`](../../../src/app/components/composer/variable-chips.html)'s
look), with its holder or "Missing", so the person sees which values
would be filled before they send it.

> **Proposed request**
> Method: ~~`GET`~~ `POST`
> Address: `{{baseUrl}}/pets`
> Header: `Content-Type: application/json`
> Body: `{ "name": "Rex", "tags": ["dog"] }`
>
> [Discard] [Accept]

**Where it lands.** If the open tab is a new request with nothing typed,
Accept fills it. Otherwise Accept opens a new tab with the proposal
(unbound, "New request"): a draft never overwrites work in progress, and
the Undo line is drawn in the tab it filled. Accept closes the dialog.

The line under the address: "Drafted from your description. [Undo]".
Undo empties the fields it filled, back to what they held. Nothing is sent
by Accept: Send is the person's.

## 3. Explain a failed response

**Where.** In the exchange record's band of a response whose status is
400 or more: after the record's sentences, "Explain this response…"
(outlined, `btn-sm`). The record does not open by itself on such a
response (it opens on a failure with no response only, `ia.md`); the
status line's words open it, as today. Palette: "Explain the response…",
while the open tab's response has such a status.

**Not offered** where the record already gives the cause: a send that got
no response (the record says what was reported and offers the Local
Bridge), a stop, a timeout, a script's error. When the record learns to
name a status's cause (a 401's, as `ai.md` expects), Explain is not
offered for that status either.

**The model is asked**: "Say in at most five sentences why this request
got this response, from what the exchange shows. Name the header, field
or value at fault. If the exchange does not show the cause, say so. Plain
text, no Markdown." Then the request as sent, the status and headers,
and the response body if ticked (for a 4xx the body is where the reason
usually is; the tick is still unticked by default, as for every call).

**What comes back** is shown under the record, as received, in monospace
(the wire's face, voice.md), wrapped, under the heading "The model
answered", with its record. There is nothing to accept and no Undo: the
explanation changes nothing. Under it: "Ask again…" (the preview again)
and "Close".

## Errors and empty states, all of them

| When | Where | Words |
|---|---|---|
| Tests tab, no tests, no response | Tests tab | "Tests you write run after each send, and their results show here." [Open the script] (no AI control: there is no response) |
| Tests tab, no tests, a response | Tests tab | The same, with [Write tests from this response…] |
| Draft, description empty | Dialog | Preview… disabled; its wrapper's tooltip: "Describe the request to preview it." |
| Draft, no variables in use | Dialog | The tick is not drawn; the line reads "No variables are in use." |
| Any action's call fails | Under the preview | [preview.md](preview.md)'s failures |
| Nothing usable | The proposal's place | "The answer held no script." / "held no request." / "was empty." + the answer + [Send again] |
| Cut at the length limit | Above the proposal | "The answer stopped at the model's length limit, so it may be incomplete." |
| Names a vault secret | The proposal's place | "The answer names a vault secret (`{{$secret.…}}`), which only you can place. It was not offered." |
| The tab closed | The proposal's place | "The tab this was for is closed." |
| A field dropped by validation | In the proposal | "Left out: {reason}." |

## Keyboard and screen reader

- Every control is a `uiButton`, reached by Tab; the palette reaches each
  action by name.
- After Accept, focus goes to Undo; the status region says "Added 4 tests
  to the post-response script." After Undo, focus goes to the control
  that asked (Write tests from this response…, or the address), and the
  status region says "Put back as it was."
- The diff is a list (`role="list"`), each line an item whose name starts
  with "Added", "Removed" or "Unchanged", so the colour and the gutter's
  `+` are not the only marks; in forced colours the added lines keep a
  border on their left.
- The Draft dialog's focus starts on Description (`cdkFocusInitial`);
  Escape asks the dialog to close (`closeRequest`), and the description
  is kept for the next opening in that tab.
- The explanation is a region named "The model answered"; focus moves to
  its heading when it arrives.

## At 390 px

- The Tests tab's control sits on its own line above the results.
- The diff wraps long lines, with the gutter kept; no line scrolls
  sideways.
- The Draft dialog is a full-width sheet (`ui-dialog`'s phone form); the
  description takes 6 lines; the preview's "What is sent" box takes the
  rest, scrolling.
- Accept and Discard share one row; the Undo line wraps after its text,
  Undo on the next line when it does not fit.

## Claims this flow adds

| Id | Claim | Test that would prove it |
|---|---|---|
| AI-5 | A model's proposal changes nothing until accepted, and Undo restores the request as it was. | e2e, per action: snapshot the draft (`store.snapshot()`), get a proposal from the mock model, compare: equal; Accept: changed; Undo: equal to the first snapshot. The tabs store, read after 250 ms, holds no proposal before Accept. |
| AI-10 | A proposal that names a vault secret's reference is refused. | e2e: the mock answers a draft with `{{$secret.abc}}` in a header; no Accept is drawn and the draft is unchanged. |
| AI-11 | An accepted script runs only where the request's scripts may run; accepting lifts no hold. | e2e: an imported collection with held scripts; accept proposed tests; Send shows the review dialog and no script runs before it. A typed request: the accepted tests run at the next send. |
| AI-12 | No model call is made but by Send to model. | e2e: with a provider set, send requests, run a collection with scripts that call `pm.sendRequest`, import a file, reload; the mock model receives nothing. |
| — | A drafted request is validated as an import is. | Unit: the draft reader refuses a method `FETCH`, a header with a line break, an address holding `{{$secret.x}}`. |
