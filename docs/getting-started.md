# Getting started

<!-- description: Send a first request in Wayfarer, save it in a collection, move its address into an environment and keep an API key in the vault. -->

Wayfarer opens at [wayfarer.ashwinsathian.com/app/](https://wayfarer.ashwinsathian.com/app/), or at `/app/` of
[your own copy](self-hosting.md). There is nothing to install and no account to make. What you save stays in this
browser's IndexedDB. <!-- claim:C-002 -->

## Send a request

Type an address in the address field, `https://httpbin.org/get` for instance, and press **Send** (⌘↵ on a Mac,
Ctrl+Enter elsewhere). The method menu beside the address starts at `GET`. The response opens beside the request, or
under it in a narrow window: the status line first (status, time, size, and where the request went), then the
**Body**, **Headers**, **Timings** and **Tests** tabs. <!-- claim:C-022 -->

The request goes from the page straight to that host. Wayfarer has no server of its own for it to pass through. <!-- claim:C-001 -->
A server that does not allow requests from other sites (CORS) is a limit of the browser, and
[the Local Bridge](browser-limits.md) is the way round it.

## Keep it in a collection

A request is saved into a collection. Make one with **New collection** in the sidebar, then press the save button
beside the address (⌘S or Ctrl+S). **Save to collection** asks for the request's name, the collection, and a folder if
you want one. Saved, the request is in the sidebar, and a click loads it into a tab. <!-- claim:C-024 -->

Each tab holds its own request and response; + opens another (Alt+T). The tabs, with their unsaved edits, are there
after a reload. <!-- claim:C-094 -->

Postman, Insomnia and OpenAPI files come in through Import in the sidebar, which shows what the file holds before
anything is stored. <!-- claim:C-054 --> [Import](import.md) has the details.

## Move the address into an environment

An environment is a set of variables you switch between, such as Staging and Production. Open **Environments** in the
toolbar (it opens in a tab), press + (**New environment**), type a name and press Enter. Then press
**Add variable** and give it the name `baseUrl` and the value `https://httpbin.org`. The environment menu in the toolbar
names the one in use; the first one you make is in use at once.

Now write the address as `{{baseUrl}}/get`. The chips under the address show each variable, where its value comes
from and the value. <!-- claim:C-025 --> A variable with no value holds the request back until you choose
**Send anyway**. <!-- claim:C-045 --> [Variables](variables.md) covers the other places a value can come from.

## Keep a key in the vault

A variable's value is stored as plain text unless you lock it. Add a variable `apiKey` and press the lock at the end
of its row. The first time, the row asks you to choose a passphrase for the vault (**Create vault**). The value is
then encrypted in this browser, and the row says "Secret stored". <!-- claim:C-027 --> <!-- claim:C-003 -->

Use it as `{{apiKey}}`, in a header or in the Auth tab. When you send, the vault fills in the value. A locked vault
asks for its passphrase first. Nothing stored, exported or copied holds the value: history shows `***`, and a file
holds only a reference to the secret. <!-- claim:C-007 --> The vault locks when you reload the page, and by default
after 15 minutes without a key press or a click. <!-- claim:C-005 --> A passphrase you
forget cannot be recovered. [Secrets](secrets.md) says how the vault works.
