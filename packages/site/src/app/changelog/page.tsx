import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { changelogHtml } from "../../lib/content";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta(
  "/changelog/",
  "Changelog: Wayfarer",
  "What changed in each release of Wayfarer, and what is on main and not released yet.",
);

/** The repository's CHANGELOG.md as a page (W2.4). */
export default function Changelog() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <article className="prose" dangerouslySetInnerHTML={{ __html: changelogHtml() }} />
      </main>
      <Footer />
    </>
  );
}
