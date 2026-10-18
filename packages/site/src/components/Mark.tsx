/** Wayfarer's mark: a route from one stop to another. */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path d="M5 18c4 0 3.5-7 7-7s3-6 7-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="0.1 4.2" />
      <circle cx="5" cy="18" r="2.6" fill="currentColor" />
      <circle cx="19" cy="5" r="2.6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
