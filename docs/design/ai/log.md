# The log: model calls in history

Part of [the AI flows](README.md). Prototype:
[prototypes/log.html](prototypes/log.html).

`ai.md`: "Each model call is a history entry of its own kind, with its
record, so the user can see what was sent to which provider and when."
History is the log; there is no second list.

## What an entry holds

A model call is a `PastRequest` (`packages/core/src/send/exchange.ts`)
written by the same path as a send's, with one field more:

```ts
/** Present on a model call (D4.10): what asked for it and what came of it. */
model?: {
  action: "tests" | "draft" | "explain" | "test";
  /** The model's name as the setting held it. */
  name: string;
  /** What the person did with the proposal; absent for an explanation and a test. */
  outcome?: "accepted" | "discarded" | "undone" | "refused" | "unusable";
};
```

- `template` is the provider's request as composed, with the key as the
  vault secret's reference, never its text; `sent` is the request as
  sent, masked (the key `***`); `response` is the provider's answer,
  masked; `record` is its `ExchangeRecord`. No field is new to the
  record.
- `outcome` is written when the person acts on the proposal, by updating
  the entry. A proposal left open when the tab closes keeps no outcome.
- The entry is a record in the existing `history` store: no new store and
  no new index (an IndexedDB change would need the maintainer, CLAUDE.md).
  Filtering by kind reads the entries already listed.
- A workspace backup carries the field; `recordProblems`'s sibling for a
  history entry learns it, and refuses any value the app does not write.
  An importer never writes it.

### With response bodies off

Settings › History's "Keep response bodies in history" is about what came
back. A model call's request quotes a response body when it was ticked,
so keeping the prompt whole would keep a body the person chose not to
keep. When the setting is off:

- the kept `sent.bodyPreview` has the quoted response body replaced by
  `[response body, 3.1 kB, not kept]`;
- the record's kept sentence says so: "History kept the request without
  the response body it quoted, and the response's status and headers, not
  its body." (a new branch of `recordLines`, written when the entry is
  marked so);
- the model's answer (the call's own response body) follows the setting
  like any other: not kept.

With the setting on, the entry keeps the prompt and the answer whole, as
masked.

## In the History drawer

A model call is listed with the requests, newest first, in the same row
shape, with what differs:

| Part of the row | A send | A model call |
|---|---|---|
| Badge | The method (`GET`, its hue) | "Model" in the neutral badge: no method hue, since the method is always `POST` and says nothing |
| Main text | The address | The action: "Write tests", "Draft a request", "Explain a response", "Test the provider" |
| Second line | Status, time | The host and the model in monospace (`api.openai.com · gpt-4.1-mini`), the status, the time, and the outcome in words: "Accepted", "Discarded", "Put back", "Refused", "Nothing usable" |

### Filtering

Above the list, beside "Search history": a `ui-segmented` named "Show",
with "All", "Requests" and "Model calls". It is drawn only when history
holds a model call. Search reads a model call's action, host and model as
it reads a send's address, method and status; its placeholder becomes
"Search by address, method, status or model" while a model call is
listed.

Empty states:

| Filter | Words |
|---|---|
| Model calls, none | "Calls to a model are listed here, each with what was sent." |
| Search with no match | "No request in history matches." (today's), or "No model call matches." with Model calls chosen |

### Opening an entry

A send's entry loads into a tab. A model call's does not: it is not a
request the person composed, and loading it would put the key's reference
into a tab where Send would use it. Opening it expands the row in place
into its record:

> **200 OK, 2,310 ms, Direct to api.openai.com**
> Sent from this page to `api.openai.com`.
> Filled from the vault: `AI provider key`. Each is *** in what is kept.
> Masked with *** in what is kept: `Authorization`.
> History kept the request and the response.
>
> Asked for by Write tests on `GET https://api.example.com/pets`, 14:02.
> Accepted.
>
> [Show what was sent] [Show the answer] [Delete from history]

"Show what was sent" and "Show the answer" open the kept texts in
monospace, wrapping, as the preview's box. "Asked for by" names the
request the call was about, by its method and address as kept (masked);
for a draft, "Asked for by Draft a request."

Select… and Clear history… act on model calls as on sends. Delete from
history deletes the entry and nothing else.

## Export as HAR

Export as HAR… takes model calls with the requests it exports, by the
filter in use (Model calls exports only them). A model call is an entry
like any other in `buildHar`: its request and response as history keeps
them, masked. The dialog's words stay; the key is a vault secret, so
"Include credentials" does not bring it back: "A vault secret is never
written." already says so. Each model call's HAR entry carries its
action in the entry's `comment` field ("Wayfarer model call: Write
tests"), which HAR 1.2 allows on an entry (unverified that `buildHar`
writes `comment` today; `har.spec.ts`'s list of required fields does not
change).

## Keyboard and screen reader

- The filter is reached by Tab from the search field; arrows choose.
  Changing it says "{n} entries." in the drawer's status region.
- A model call's row is named "Model call, Write tests, api.openai.com,
  200, 14:02, accepted". Enter or Space expands it; focus moves to the
  record's first line; Escape collapses it and focus returns to the row.
- The record inside the row is the record component, with its own region
  name, "Exchange record".

## At 390 px

The drawer is full width. The filter's three options fit one line at
320 px ("Model calls" is the widest). The row's second line wraps after
the model's name. The expanded record wraps every value; its three
buttons wrap onto two lines.

## Claims this flow adds

| Id | Claim | Test that would prove it |
|---|---|---|
| AI-13 | Each model call is a history entry with its record, and is masked there as a send is. | e2e: make one call of each action with a key; History lists four entries, each opening into a record whose sentences equal the call's; the store's entries hold `***` where the key went and no text of the key. |
| AI-14 | With response bodies off in history, a model call's kept prompt holds no response body. | e2e: turn the setting off, write tests with the body ticked; the stored entry holds neither the response body's text nor the answer, and its record says the quoted body was not kept. |
| AI-15 | A HAR export of model calls holds no key and nothing history masked. | e2e: export with Include credentials ticked; the file holds no text of the key, the vault secrets or the cookie values (the scan of `secrets-wire.spec.ts`). |
| — | A model call's entry does not load into a tab. | e2e: open it; the tab strip is unchanged. |
