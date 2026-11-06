import { isShareFragment } from "@wayfarer/core";

let taken: string | null = null;

/**
 * A shared link's fragment, taken off the address bar (T1.3, `receive.md`): `main.ts` calls it before the app starts,
 * so nothing reads the address with the link in it. The fragment stays in the browser's own history list.
 */
export function takeShareFragment(): string | null {
  if (!isShareFragment(location.hash)) return null;
  taken = location.hash;
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  return taken;
}

/** The fragment `main.ts` took, once: the app opens it at its start. */
export function shareFragmentAtStart(): string | null {
  const hash = taken;
  taken = null;
  return hash;
}
