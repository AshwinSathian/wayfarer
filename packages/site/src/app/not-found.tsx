import { Footer } from "../components/Footer";
import { Header } from "../components/Header";

export const metadata = { title: "Not found: Wayfarer", description: "There is no page at this address." };

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">There is no page at this address.</h1>
        <p className="mt-4 max-w-xl text-lg text-ink-muted">
          It may have moved when the site did. The docs are listed on <a className="text-route underline underline-offset-4" href="/docs/">one page</a>, and
          the app is a click away.
        </p>
        <p className="mt-8">
          <a href="/" className="rounded-lg border border-line-strong px-4 py-2.5 font-bold text-ink hover:border-route">
            Go to the front page
          </a>
        </p>
      </main>
      <Footer />
    </>
  );
}
