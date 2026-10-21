import localFont from "next/font/local";

// The site's faces, from the Fontsource packages' Latin files (next/font takes only literal paths). It serves them
// from the site and preloads the two the first view draws. `optional`: a face that has not arrived when the page is
// first drawn is not swapped in later (that repaint was the mobile LCP, 2.8 s); the fallback is sized to match it.

export const display = localFont({
  src: "../../../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-bricolage",
  display: "optional",
});

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
