# Setup: Settings › AI

Part of [the AI flows](README.md). Prototype:
[prototypes/setup.html](prototypes/setup.html).

## Where it lives

A new entry of `SECTIONS` (`src/app/components/settings/settings.ts`),
after Local Bridge and before Cookies, and its `@case` in the dialog:

- id `ai`, label "AI", icon `auto_awesome` (the build may choose another
  from the app's icon set; unverified that this one is loaded).
- about: "A model you choose, for tests, drafts and explanations. Off
  until you add one."

The shell can open it at the section (`openSettings("ai")`), as it opens
the Local Bridge's. Nothing else in the app mentions AI until a provider is
saved. The palette gains "AI settings" only once one is.

## The pane, with no provider

One `settings-group`:

> **AI**
> Wayfarer sends nothing to a model until you add one here. Each call is
> shown to you, byte for byte, before it is sent.
>
> [Add a provider]

Add a provider is a filled button. It draws the form below in the same
pane and moves focus to Provider.

## The form

Each field is a `settings-row` of one `settings-group` named "Provider".

| Field | Control | Words |
|---|---|---|
| Provider | `ui-segmented`, two options | "OpenAI-compatible", "Anthropic". Under it, by choice: "OpenAI, Ollama, LM Studio and any server that answers OpenAI's chat completions." / "Anthropic's Messages API." |
| Address | `uiInput`, `font-mono` | Label "Address". Empty for OpenAI-compatible, placeholder `http://localhost:11434/v1`; `https://api.anthropic.com` filled in for Anthropic. Under it, live: "Calls go to {address}/chat/completions." or "Calls go to {address}/v1/messages." with the path in monospace. |
| Model | `uiInput`, `font-mono` | Label "Model". Under it: "The model's name, as the provider writes it." No list is fetched: asking a provider for its models would be a call the person did not preview. |
| Key | see below | Label "Key". Under it: "Kept in the vault, encrypted. A model on this machine needs none." |
| Route | `ui-segmented`, the bridge pane's three options | "Auto", "Direct", "Local Bridge". Under it: "Auto sends from this page, and asks before trying the Local Bridge if the page gets no response." |
| Actions | three `uiCheckbox` with labels | "Write tests from a response", "Draft a request from a description", "Explain a failed response". All ticked when a provider is added. Under the group: "Each call is still shown to you before it is sent." |

Buttons at the group's end: "Test the provider…" (outlined) and "Save"
(filled). Save is enabled when Address and Model hold text and, for
Anthropic, a key is set. A disabled Save says why in a tooltip on its
wrapper ("Add the model's name to save."), as `curl-btn-wrap` does.

Address is text, not a URL: it is not round-tripped through `URL`. It may
not hold `{{`: a provider's address is not a template, and the field says
"An address here cannot hold a variable." under itself, `aria-invalid`.

### The key and the vault

The key is a vault secret named "AI provider key", as the bridge's token
is "Local Bridge token" (`BridgeSettings`). It is never in `localStorage`
or in the AI setting; the setting holds the secret's id. Four states:

| Vault | The Key row shows |
|---|---|
| Unlocked, no key | A `uiInput` (`font-mono`, `type="password"`, `autocomplete="off"`) and "Show key" (icon button). The key is written to the vault on Save. |
| Unlocked, key set | "*** in the vault" (the mask in monospace) and "Change key", which draws the field, empty. There is no Remove key: a key is removed with its provider. |
| Locked | "The vault is locked. Unlock it to add or change the key." and "Unlock secrets" (the status bar's name). When a key is set, also "*** in the vault": a locked vault still has it. |
| No vault | "A key is kept in the vault, and this browser has none yet." and "Set up the vault", which opens Settings › Vault. A provider with no key (a local model) is saved without one. |

### Test the provider

Test the provider… opens the model call preview ([preview.md](preview.md))
in the pane, under the buttons, for a call of a few bytes. The prompt is
fixed and has no part of a request in it:

```json
{
  "model": "llama3.2",
  "max_tokens": 8,
  "messages": [{ "role": "user", "content": "Reply with the word OK." }]
}
```

(`max_tokens` for OpenAI-compatible endpoints is the older name; the
build writes the field each API documents. Unverified which name each
OpenAI-compatible server accepts; `max_tokens` is the one Ollama and LM
Studio read, as remembered.)

The test uses the fields as typed, saved or not, so a person can try an
address before saving it. After Send to model:

| What came back | The pane says |
|---|---|
| Any 2xx with text | "The provider answered: `OK`" (the answer in monospace, cut at 200 characters), then "Tested {time}." The record's band below it. |
| 2xx with no text | "The provider answered with no text. The model may need a longer reply limit, or another name." |
| No response | The record's headline: "The request got no response. Direct to localhost:11434, no bridge paired." and the record's own offer (Send through the Local Bridge, or the bridge's setup in place). |
| 401 or 403 | "{Provider} refused the key: 401 Unauthorized." then the provider's own message in monospace, then "Change key". |
| 404 | "{Provider} has no such address or model: 404 Not Found." then its message. |
| Any other status | "{Provider} answered 500 Internal Server Error." then its message. |

`{Provider}` is the host as sent ("api.anthropic.com"), in monospace, not
a brand: the app names what it sent to, not who it believes is there.

### Removing a provider

"Remove provider…" (danger tone, text button) at the end of the group,
once one is saved. It asks, since the key cannot be brought back:

> **Remove the provider at api.openai.com?**
> Its key is deleted from the vault, and AI is off again. History keeps
> the model calls already made. This cannot be undone.
>
> [Cancel] [Remove provider]

Remove provider deletes the vault secret, clears the setting, and the
pane shows its empty state. Every AI control disappears at once (each
reads one signal). A locked vault does not block removal: the setting is
cleared at once and the secret is deleted when the vault is next
unlocked, which the pane says: "The key is deleted from the vault the
next time it is unlocked." (unverified that `SecretsVault.deleteSecret`
can wait so; it may need a list of ids to delete on unlock).

## Errors and empty states, all of them

| When | Where | Words |
|---|---|---|
| No provider | The pane | "Wayfarer sends nothing to a model until you add one here. Each call is shown to you, byte for byte, before it is sent." [Add a provider] |
| Address empty on Save | Under Address, `role="alert"` region from first render | "Type the provider's address." |
| Address holds `{{` | Under Address | "An address here cannot hold a variable." |
| Model empty | Under Model | "Type the model's name." |
| Anthropic, no key | Under Key | "Anthropic's API needs a key." |
| Vault refuses the write (locked meanwhile) | Under Key | "The vault locked before the key was saved. Unlock it and save again." |
| Test: each row of the table above | Under the buttons | As above |

## Keyboard and screen reader

- Tab order: the section list, then Provider (arrows move between the two
  options), Address, Model, Key (and Show key), Route, the three actions,
  Test the provider…, Save, Remove provider….
- Add a provider moves focus to Provider's chosen option. Save keeps
  focus on Save and says "Saved." in the pane's `role="status"` region
  (in the page from the first render).
- Each field's hint is its `aria-describedby`; an error joins it and sets
  `aria-invalid`.
- A screen reader on Key, unlocked with a key: "Key, *** in the vault,
  Change key, button". Locked: "The vault is locked. Unlock it to add or
  change the key. Unlock secrets, button".
- The test's result goes to the status region: "The provider answered:
  OK." or the failure's first sentence.

## At 390 px

Settings is the section list; AI opens as a pane with "All settings" to
go back (`settings-pane-open`). Each row stacks its label over its
control. The two segmented choices fit one line each at 320 px
("OpenAI-compatible" is the widest label, about 150 px in the body type;
unverified until drawn). The address wraps (`break-all`), never scrolls
sideways. The preview of a test opens under the buttons, full width.

## Claims this flow adds

| Id | Claim | Test that would prove it |
|---|---|---|
| AI-1 | No request goes to a model until a provider is set up. | e2e: a fresh app; open every view, the palette, each response kind; assert no AI control is drawn and no request leaves for any host but the echo server's. |
| AI-6 | The provider's key is kept only as a vault secret. | e2e: save a provider with a key; read every `localStorage` key, every IndexedDB store but the vault's, and the AI setting: the key's text is in none. |
| AI-7 | Removing the provider deletes its key from the vault and draws no AI control again. | e2e: set up, remove; the vault lists no "AI provider key"; the response's Tests tab and the palette have no AI command. |
| — | A test of the provider is previewed like any model call. | Covered by AI-3's e2e, run on the test call too. |
