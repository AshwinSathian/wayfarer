/**
 * Wayfarer's mark (packages/tokens/brand/mark.svg), drawn inline so that it takes the page's theme: the tile is the
 * ink and the glyph the paper, as the app draws it in its own ink.
 */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <rect width="26" height="26" rx="6" className="fill-ink" />
      <path
        d="M9 17.5V13.5C9 10.7 11.2 8.5 14 8.5H17"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-paper"
      />
      <circle cx="17" cy="8.5" r="1.5" className="fill-paper" />
    </svg>
  );
}
