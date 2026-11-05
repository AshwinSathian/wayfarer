import { REPO } from "../lib/content";
import { Mark } from "./Mark";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  ["Docs", "/docs/"],
  ["Compare", "/compare/"],
  ["Changelog", "/changelog/"],
  ["GitHub", REPO],
] as const;

/**
 * The site's header: the name, the pages a reader looks for, the theme, and the app (the blog and the roadmap are in
 * the footer). Below 1024 px the pages and the theme fold into a menu, and below 384 px the name is the mark alone, so
 * that "Open Wayfarer" keeps to one line at 320 px (D5-e: it took two at 390).
 */
export function Header() {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-8 sm:px-6">
        {/* min-w-0: the row may squeeze the name, as it did when the mark was an <img> (#534). */}
        <a href="/" className="flex min-w-0 items-center gap-2 type-site-lede font-bold text-ink">
          <Mark className="size-7" />
          <span className="max-[24em]:sr-only">Wayfarer</span>
        </a>
        <nav aria-label="Site" className="hidden gap-6 type-site-small text-ink-muted lg:flex">
          {LINKS.map(([name, href]) => (
            <a key={name} href={href} className="hover:text-ink">
              {name}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <details className="group relative lg:hidden">
            <summary className="grid h-10 cursor-pointer list-none place-items-center rounded-sm px-3 type-site-small text-ink-muted hover:bg-paper-sunk [&::-webkit-details-marker]:hidden">
              Menu
            </summary>
            <nav
              aria-label="Site"
              className="absolute right-0 z-10 mt-2 flex w-48 flex-col rounded-lg border border-line bg-paper-raised p-2 shadow-[var(--shadow-overlay)]"
            >
              {LINKS.map(([name, href]) => (
                <a key={name} href={href} className="rounded-sm px-3 py-2 text-ink hover:bg-paper-sunk">
                  {name}
                </a>
              ))}
              <ThemeToggle labelled className="mt-1" />
            </nav>
          </details>
          <ThemeToggle className="hidden lg:grid" />
          <a
            href="/app/"
            className="rounded-sm bg-action px-3 py-2 type-site-small font-bold whitespace-nowrap text-on-action hover:opacity-90 sm:px-4"
          >
            Open Wayfarer
          </a>
        </div>
      </div>
    </header>
  );
}
