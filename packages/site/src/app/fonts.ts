import localFont from "next/font/local";

// The site's faces are the app's (W5.1), from the Fontsource packages' Latin files (next/font takes only literal
// paths). It serves them from the site and preloads the text face the first view draws. `optional`: a face that has
// not arrived when the page is first drawn is not swapped in later (that repaint was the mobile LCP, 2.8 s); the
// fallback is sized to match it. Each is put before the tokens' own stack (`--font-sans`, `--font-mono`) in
// globals.css, which names no face of its own.

export const body = localFont({
  src: [
    {
      path: "../../../../node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../../node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-atkinson",
  display: "optional",
});

/**
 * The wire's face, as the app's: an address, a header, a value. Not preloaded. No metric fallback: next/font's is
 * Arial, which drew the wire in a sans until the face came; without it the tokens' mono stack follows.
 */
export const code = localFont({
  src: "../../../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2",
  weight: "400",
  variable: "--font-jetbrains",
  display: "optional",
  preload: false,
  adjustFontFallback: false,
});
