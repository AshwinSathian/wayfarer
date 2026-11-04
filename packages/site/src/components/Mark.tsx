/**
 * Wayfarer's mark (packages/tokens/brand/mark.svg), drawn inline so that it takes the page's theme: the tile is the
 * ink and the glyph the paper, as the app draws it in its own ink.
 */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <rect width="26" height="26" rx="6" className="fill-ink" />
      <path
        d="M5.1 9.2L8.3 18.3L11.9 11.2L15.5 18.3L18.1 12.4"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-paper"
      />
      <circle cx="19.1" cy="9.4" r="3" className="fill-paper" />
    </svg>
  );
}
