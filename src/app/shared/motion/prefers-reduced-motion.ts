/**
 * Reads the user's OS-level reduced-motion preference once, synchronously.
 *
 * Every hand-authored CSS `animation`/`transition` in the app already
 * routes through the blanket `@media (prefers-reduced-motion: reduce)`
 * override in design-system/animations.css — that alone is sufficient for
 * CSS-driven motion. This helper exists for the smaller set of surfaces
 * that use PrimeNG components driven by `@angular/animations` internally
 * (e.g. Accordion's expand/collapse), which run on the Web Animations API
 * and are therefore untouched by a CSS media query. Those components
 * expose a `transitionOptions`-style input specifically so callers can
 * shorten/disable the animation; this helper is what decides the value.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
