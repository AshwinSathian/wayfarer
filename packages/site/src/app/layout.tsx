import type { Metadata } from "next";
import type { ReactNode } from "react";
import { body, display } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://wayfarer.ashwinsathian.com"),
  title: "Wayfarer: an API client in your browser",
  description: "An API client that runs in your browser and keeps your work on your device. No install, no account, no server of its own.",
  // The app's own icons: one mark for the site and the app.
  icons: {
    icon: [{ url: "/app/favicon.ico", sizes: "any" }, { url: "/app/icons/logo.svg", type: "image/svg+xml" }],
    apple: "/app/icons/icon-192x192.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // /app/theme.js sets data-theme before the page is drawn, so React finds an attribute it did not write.
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script src="/app/theme.js" />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
