/** Wayfarer's mark: the app's own file (public/icons/logo.svg of the app), so the site and the app show one. */
export function Mark({ className = "" }: { className?: string }) {
  return <img src="/app/icons/logo.svg" alt="" width={26} height={26} className={`rounded-md ${className}`} />;
}
