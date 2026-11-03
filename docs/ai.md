# AI

Wayfarer can ask a model to write tests for a response, draft a request
from a description, or explain a failed response. Nothing of this is on
until you add a provider. Every call to the model is shown to you before
it is sent, and is kept in History like any request you send.

## Turning it on

<!-- claim:C-069 -->

AI is off until you add a provider in **Settings › AI**. Until then no AI
control is drawn anywhere, the palette has no AI command, and no request
goes to a model.

A provider is one of:

- **OpenAI-compatible**: OpenAI, Ollama, LM Studio, and any server that
  answers OpenAI's chat completions. The address is the API's base, such
  as `https://api.openai.com/v1` or `http://localhost:11434/v1`.
- **Anthropic**: Anthropic's Messages API, at `https://api.anthropic.com`.

You give the model's name and, for a hosted model, a key. A model on your
own machine needs none.

<!-- claim:C-074 -->
<!-- claim:C-075 -->

The key is kept only as a vault secret named "AI provider key"
([`secrets.md`](secrets.md)), so the vault must be unlocked to save it, and
to send a call that uses it. The setting holds the address, the model's
name, the route and which actions are offered; it holds no key. **Remove
provider…** deletes the key from the vault and turns AI off again.

The route is a request's route ([`browser-limits.md`](browser-limits.md#routes)):
**Direct**, **Local Bridge** or **Auto**. A model on your machine that
sends no CORS headers is reached through the Local Bridge, as any such
server is.

**Test the provider…** sends a call of a few bytes ("Reply with the word
OK."), shown first like every other call.

## What is sent, and when

<!-- claim:C-071 -->
<!-- claim:C-080 -->

Each action opens a preview of the call before anything leaves: where it
goes, by which route, the key as ***, which parts of the request and the
response are in the prompt, and the request's body byte for byte. What the
preview shows is what is sent. Nothing calls a model but **Send to model**:
no send, run, script, import, reload or cancelled preview does.
<kbd>⌘</kbd><kbd>↵</kbd> (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>) stays the
request's Send.

<!-- claim:C-070 -->

The prompt quotes an exchange as History keeps it, after the redactor: a
vault secret and a credential are *** in it, whatever the model is.

<!-- claim:C-072 -->

A response body goes into a prompt only when you tick **The response
body** for that call. The tick starts unticked every time a preview opens.
A body longer than 16 kB is cut there, and a prompt is 128 kB at most.

<!-- claim:C-076 -->
<!-- claim:C-077 -->

Nothing in a prompt is a template: `{{baseUrl}}` in a description goes as
written, never as its value. A prompt that names a vault secret's reference
(`{{$secret.…}}`) is not sent, and the preview says why.

A call is given 120 seconds. **Stop** ends it.

## The actions

Each is offered only while its action is ticked in Settings › AI.

### Write tests from this response

In the response's **Tests** tab, and in the palette as **Write tests from
the response…**. The model is given the request as sent, the response's
status and headers, the post-response script, and the response body if
ticked. What it answers is shown as lines added after the post-response
script, with a note for any line that sends a request, loads a library or
sets a variable.

### Draft a request from a description

**Describe a request…** where the response would be, and **Draft a
request from a description…** in the palette. You describe the request;
the names (never the values) of the variables in use go with it while
their tick is ticked. The answer is read as an imported request is, and
shown field by field. **Accept** fills the tab when nothing is typed in it,
otherwise a new tab, and sends nothing.

### Explain this response

In the exchange record of a response whose status is 400 or more, and in
the palette as **Explain the response…**. The model is given the request
as sent, the response's status and headers, and the body if ticked. Its
answer is shown as it came, as text, never rendered, with nothing to
accept.

## Proposals

<!-- claim:C-073 -->
<!-- claim:C-078 -->
<!-- claim:C-079 -->

What a model proposes changes nothing until you press **Accept**. Then
**Undo** puts the script or the request back as it was. A proposal that
names a vault secret's reference is refused and not offered: only you place
a secret.

Accepted tests are text you put there, as if typed. They run where the
request's scripts may run ([`scripts.md`](scripts.md)): at the next send of
a request typed here, or one whose scripts were reviewed. Accepting lifts
no hold: the scripts of an imported request that is not reviewed yet, the
accepted tests among them, still wait for the review.

## History

<!-- claim:C-081 -->
<!-- claim:C-082 -->
<!-- claim:C-083 -->

Each call to a model is a History entry with its exchange record, masked
as a send is: the key is ***. History lists it as **Model**, with the
action, the host and the model; **Show** filters History to requests or to
model calls once there is one. A model call opens in place, into its record
and what was sent; it never loads into a tab, where Send would use its key.

With **Keep response bodies in history** off, a call whose prompt quoted a
response body keeps neither that prompt nor the model's answer, and its
record says so.

A HAR export of model calls carries each with its action in the entry's
comment, as History keeps it: no key, and nothing History masked.
