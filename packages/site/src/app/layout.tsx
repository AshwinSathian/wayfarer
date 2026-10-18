import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://wayfarer.ashwinsathian.com"),
  title: "Wayfarer: an API client in your browser",
  description: "An API client that runs in your browser and keeps your work on your device. No install, no account, no server of its own.",
  icons: { icon: "/app/favicon.ico" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // /app/theme.js sets data-theme before the page is drawn, so React finds an attribute it did not write.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="/app/theme.js" />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
