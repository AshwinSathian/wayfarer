import { REPO } from "../lib/content";
import { Mark } from "./Mark";

const COLUMNS = [
  ["Product", [["The app", "/app/"], ["Docs", "/docs/"], ["Command line", "/docs/cli/"], ["Changelog", "/changelog/"], ["Roadmap", "/roadmap/"]]],
  ["Trust", [["Claims ledger", "/docs/claims/"], ["Trust center", "/docs/trust-center/"], ["Threat model", "/docs/threat-model/"], ["Security policy", `${REPO}/blob/main/SECURITY.md`]]],
  ["Project", [["Source on GitHub", REPO], ["Host it yourself", "/docs/self-hosting/"], ["MIT licence", `${REPO}/blob/main/LICENSE`]]],
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:grid-cols-3 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs sm:col-span-3 md:col-span-1">
          <a href="/" className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Mark className="size-7" />
            Wayfarer
          </a>
          <p className="mt-3 text-sm text-ink-muted">An API client that runs in your browser. No account, no server of its own, no analytics on this site.</p>
        </div>
        {COLUMNS.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-muted">
              {links.map(([name, href]) => (
                <li key={name}>
                  <a href={href} className="hover:text-ink">
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
