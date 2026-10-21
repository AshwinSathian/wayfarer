// Light or dark, stored as the app's own choice (`wayfarer:theme`), so the site and the app agree. /app/theme.js reads
// it before the page is drawn; public/site.js makes this button switch it.
export function ThemeToggle() {
  return (
    <button
      type="button"
      data-theme-toggle
      aria-label="Switch between light and dark"
      className="grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-paper-sunk hover:text-ink"
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
    </button>
  );
}
