// Light or dark, stored as the app's own choice (`wayfarer:theme`), so the site and the app agree. /app/theme.js reads
// it before the page is drawn; public/site.js makes this button switch it.
// `labelled` is the header menu's: its name is shown beside the icon.
export function ThemeToggle({ className = "", labelled = false }: { className?: string; labelled?: boolean }) {
  return (
    <button
      type="button"
      data-theme-toggle
      aria-label={labelled ? undefined : "Switch between light and dark"}
      className={`items-center gap-2 rounded-sm text-ink-muted hover:bg-paper-sunk hover:text-ink ${
        labelled ? "flex px-3 py-2 text-left" : "size-10 place-items-center"
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
      </svg>
      {labelled && "Switch between light and dark"}
    </button>
  );
}
