# Sharing

<!-- description: Send a collection to a teammate as a file or as an encrypted link, what goes with it, and what the receiver sees before anything is stored. -->

A collection can be sent to someone else as a copy: a file, or a link. A
copy is not kept in step: a change made later on either side stays there.
Sharing that keeps a collection in step (a folder in Git, peer to peer, a
team server) is on the [roadmap](https://wayfarer.ashwinsathian.com/roadmap/).

## Share a collection

Open a collection's menu in the sidebar (right-click, or Shift+F10 on its
row) and choose **Share…**, or type "Share" in the palette with the
collection selected. The dialog says what goes before anything leaves:

- **What goes:** its folders, requests, variables, auth and scripts. Not
  your history, your environments or the vault.
- **Protected variables** are shared as their names. A vault secret is
  never written; each person adds their own value.
- **Credentials** typed into an auth field (a token, a password, a key)
  are written as `***`, unless you tick **Include credentials** for that
  one file or link. <!-- claim:C-088 -->
  Only auth fields are masked: a password in an address
  (`https://user:pass@…`), a key in a query parameter, or a token in a
  plain variable or in a header not named as one (`Authorization` is) goes
  as you typed it. Keep those in the vault.
- **Scripts** go with the collection, and do not run for the receiver
  until they have read them and trusted them.
- **Request settings** go too, the certificate check and the route among
  them: a request set to skip the check is still set so for the receiver.

Nothing it writes holds a vault secret's plaintext. <!-- claim:C-087 -->

Before its button is enabled, the dialog names where the collection goes:
the file's name, or the link's length. <!-- claim:C-089 -->

### As a file

**Send as: File** writes `shop-api.wayfarer.json`, the same Wayfarer file
Export… writes. The receiver opens it with **Import › File…** and sees the
[import report](import.md) before anything is stored.

### As a link

**Send as: Link** puts the collection in the link, compressed and
encrypted (AES-GCM-256, under a key made for that link). The encrypted
collection is after the `#` of the address, which a browser never sends to
a server, Wayfarer's included; opening the link loads the app's own files
and nothing else. <!-- claim:C-084 -->

The key is a **code**, shown apart from the link: send it another way (say
it, or send it in a different app). Whoever has the link without the code
cannot read it. **Put the code in the link** is off; ticked, anyone who
sees the link can read the collection.

A link can be 12 kB at most. Every browser opens a much longer one, but
chat apps cut them: a Microsoft Teams message holds about 28 kB with its
formatting, in which a link is written twice, and Telegram splits a
message at 4,096 characters. A longer collection is offered as a file.

## Open a link

Opening a link takes the part after `#` off the address bar before the app
reads anything else, so a reload or a copied address does not carry it.
<!-- claim:C-085 --> The browser's own history list still holds the
address you opened: clear it there if the link must not stay on this
device.

The app asks for the code, unless the link carries it, then shows the
import report: what the collection adds, and every host it sends to, each
request's address and each OAuth 2.0 sign-in and token address.
<!-- claim:C-090 --> **Nothing is stored until you choose Import**; Cancel
stores nothing, and the link can be opened again. <!-- claim:C-086 -->
Its scripts arrive held, as an imported file's do.

A wrong code says "This code does not open the link." A link that was
changed or cut short says it is incomplete: AES-GCM refuses any changed
byte, so a damaged link is never read in part.
