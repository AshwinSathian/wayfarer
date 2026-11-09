# Wayfarer's brand files

Every file here is written from `../brand.mjs` and the tokens: do not edit one by hand.

- `npm run gen:tokens` writes the SVGs, and `npm run check:tokens` fails when one is not what the
  tokens give.
- `npm run gen:brand` draws the PNGs, `app/favicon.ico` and `social.png` from them, in Chromium. Run it
  after the mark or its colours change, and commit what it writes.

## The mark

The "Switchback W" (chosen on 2026-11-04): the name's W drawn as one trail that doubles back on
itself, its last leg running into a dot, the host it reaches. It is what Wayfarer shows of every
request: where it went. The dot is wider than the stroke so that it still reads as a dot at 16 px;
without it the mark is a plain W.

The tile is the ink, Send's fill, and the glyph the colour on it (`--ink` and `--on-ink`), so it is
dark on the light theme and light on the dark one. Hue means a method or a status in Wayfarer and
nothing else (DQ11), so the mark has none. The glyph is 2.4 units wide on the 26-unit tile, centred,
and drawn inline in the app (`app-mark`) and on the site (`Mark.astro`) from the same numbers
(`TRAIL` and `HOST` in `../brand.mjs`; `scripts/installed-app.test.mjs` holds them equal).

The name is set in Bricolage Grotesque Bold (700), the headline face, in the app, on the site and in the
wordmark, and in no other weight.

| File | What it is |
| --- | --- |
| `mark.svg`, `mark-dark.svg` | The mark, for a light and a dark ground. 26 units; the tile's corners are 6. |
| `wordmark.svg`, `wordmark-dark.svg` | The mark and the name, as the sidebar sets them: the name in Bricolage Grotesque Bold at 15 beside the 26-unit mark, 10 apart, its capitals centred on the tile. The name is outlined, so the file needs no font. |
| `favicon.svg` | The mark in the browser's own scheme (`prefers-color-scheme`). |
| `maskable.svg` | The installed app's maskable icon: the tile fills the square, and the glyph is drawn at 0.74 of its size, 7.5 units from the centre at most, well inside the safe zone. |
| `app/icon-192.png`, `app/icon-512.png` | The manifest's `any` icons: the mark, its corners clear. |
| `app/maskable-512.png` | The manifest's `maskable` icon. |
| `app/apple-touch-icon.png` | 180 px, the full square: iOS cuts its own corners. |
| `app/favicon.ico` | The mark at 16, 32 and 48 px, for what does not read the SVG. |
| `social.png` | 1,200 by 630: the wordmark and the line the site's home page leads with. The site's pages draw their own cards in the same colours (`packages/site/social-images.mjs`). |

Use the mark at 16 px or more: it was checked pixel by pixel at 16 and 32 px, and at 16 the dot is
already only a little wider than the leg it ends. Leave clear space
of a quarter of its size around it. Do not recolour it, add a gradient or a shadow, or set the name in
another face or weight.

## The icon set

`icons/` holds one SVG per icon the app draws, by the name `<app-icon name>` takes. Each is a single path
on a 24-unit grid, stroked 2 units wide with round caps and joins in `currentColor`, every point inside
2 units of padding (`brand.test.mjs` holds the rules, and that the app draws each one). The stroke is
0.083 of the icon's size, the weight of Figtree Regular's stems (0.080 to 0.085 em, its l and I):
an icon at its text's size has its text's weight (U-127). `npm run gen:tokens` writes
`src/app/shared/icon/icon-paths.ts` from them.

To add an icon, draw it under those rules, run `npm run gen:tokens` and `npm run gen:brand`, and read the
new glyph in `icons-1x.png` and `icons-2x.png`: each icon at 16, 20 and 24 px and beside 13 px text, in
the light and the dark theme. Delete the file of an icon nothing draws.
