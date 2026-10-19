import { REPO } from "../lib/content";
import { Mark } from "./Mark";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  ["Docs", "/docs/"],
  ["Claims", "/docs/claims/"],
  ["Blog", "/blog/"],
  ["Changelog", "/changelog/"],
  ["Roadmap", "/roadmap/"],
  ["GitHub", REPO],
] as const;

/** The site's header: the name, the pages a reader looks for, the theme, and the app. Below 1024 px the pages fold into a menu. */
export function Header() {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-8 sm:px-6">
        <a href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
          <Mark className="size-7" />
          Wayfarer
        </a>
        <nav aria-label="Site" className="hidden gap-6 text-[0.95rem] text-ink-muted lg:flex">
          {LINKS.map(([name, href]) => (
            <a key={name} href={href} className="hover:text-ink">
              {name}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <details className="group relative lg:hidden">
            <summary className="grid h-10 cursor-pointer list-none place-items-center rounded-lg px-3 text-[0.95rem] text-ink-muted hover:bg-paper-sunk [&::-webkit-details-marker]:hidden">
              Menu
            </summary>
            <nav aria-label="Site" className="absolute right-0 z-10 mt-2 flex w-48 flex-col rounded-xl border border-line bg-paper-raised p-2 shadow-lg">
              {LINKS.map(([name, href]) => (
                <a key={name} href={href} className="rounded-lg px-3 py-2 text-ink hover:bg-paper-sunk">
                  {name}
                </a>
              ))}
            </nav>
          </details>
          <ThemeToggle />
          <a href="/app/" className="rounded-lg bg-route px-3 py-2 text-[0.95rem] font-bold text-route-ink hover:opacity-90 sm:px-4">
            Open Wayfarer
          </a>
        </div>
      </div>
    </header>
  );
}
