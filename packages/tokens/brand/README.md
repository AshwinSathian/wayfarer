# Wayfarer's brand files

D2.4 of `PLAN-design.md`; the choices and the arguments against them are row 1.62 of its section 14.
Every file here is written from `../brand.mjs` and the tokens: do not edit one by hand.

- `npm run gen:tokens` writes the SVGs, and `npm run check:tokens` fails when one is not what the
  tokens give.
- `npm run gen:brand` draws the PNGs, `app/favicon.ico` and `social.png` from them, in Chromium. Run it
  after the mark or its colours change, and commit what it writes.

## The mark

A path that sets out and turns to the host it reaches, on a rounded tile. It is the first mark's
glyph; what changed in D2.4 is its colour. The tile is the ink, Send's fill, and the glyph the colour
on it (`--ink` and `--on-ink`), so it is dark on the light theme and light on the dark one. Hue means a
method or a status in Wayfarer and nothing else (DQ11), so the mark has none.

| File | What it is |
| --- | --- |
| `mark.svg`, `mark-dark.svg` | The mark, for a light and a dark ground. 26 units; the tile's corners are 6. |
| `wordmark.svg`, `wordmark-dark.svg` | The mark and the name, as the sidebar sets them: the name in Atkinson Hyperlegible Next SemiBold at 15 beside the 26-unit mark, 10 apart, its capitals centred on the tile. The name is outlined, so the file needs no font. |
| `favicon.svg` | The mark in the browser's own scheme (`prefers-color-scheme`). |
| `maskable.svg` | The installed app's maskable icon: the tile fills the square, and the glyph keeps the mark's size, inside the safe zone. |
| `app/icon-192.png`, `app/icon-512.png` | The manifest's `any` icons: the mark, its corners clear. |
| `app/maskable-512.png` | The manifest's `maskable` icon. |
| `app/apple-touch-icon.png` | 180 px, the full square: iOS cuts its own corners. |
| `app/favicon.ico` | The mark at 16, 32 and 48 px, for what does not read the SVG. |
| `social.png` | 1,200 by 630: the wordmark and the line the site's home page leads with. The site's pages draw their own cards in the same colours (`packages/site/social-images.mjs`). |

Use the mark at 16 px or more, with clear space of a quarter of its size around it. Do not recolour it,
add a gradient or a shadow, or set the name in another face.
