import type { Metadata } from "next";
import type { ReactNode } from "react";
import { body, code } from "./fonts";
import "./globals.css";
import { SITE } from "../lib/meta";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  // The app's own icons: one mark for the site and the app.
  icons: {
    icon: [
      { url: "/app/favicon.ico", sizes: "32x32" },
      { url: "/app/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/app/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${code.variable}`}>
      <head>
        <script src="/app/theme.js" />
        <script src="/site.js" defer />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
