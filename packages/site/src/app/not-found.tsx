import { Footer } from "../components/Footer";
import { Header } from "../components/Header";

export const metadata = { title: "Not found: Wayfarer", description: "There is no page at this address." };

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h1 className="type-site-title-1 font-bold text-ink sm:type-site-display">There is no page at this address.</h1>
        <p className="mt-4 max-w-xl type-site-lede text-ink-muted">
          It may have moved when the site did. The docs are listed on{" "}
          <a className="text-action underline underline-offset-4" href="/docs/">
            one page
          </a>
          , and the app is a click away.
        </p>
        <p className="mt-8">
          <a
            href="/"
            className="rounded-sm border border-line-strong px-4 py-2.5 font-bold text-ink hover:border-action"
          >
            Go to the front page
          </a>
        </p>
      </main>
      <Footer />
    </>
  );
}
