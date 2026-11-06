import { isShareFragment } from "@wayfarer/core";

let taken: string | null = null;

/**
 * A shared link's fragment, taken off the address bar (T1.3, `receive.md`): `main.ts` calls it before the app starts,
 * so nothing reads the address with the link in it, and it is kept for the app to open once. A `hashchange` of the open
 * app takes it with `keep: false`: the code is then held by the dialog alone. The fragment stays in the browser's own
 * history list.
 */
export function takeShareFragment({ keep } = { keep: true }): string | null {
  const hash = location.hash;
  if (!isShareFragment(hash)) return null;
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  if (keep) taken = hash;
  return hash;
}

/** The fragment `main.ts` took, once: the app opens it at its start. */
export function shareFragmentAtStart(): string | null {
  const hash = taken;
  taken = null;
  return hash;
}
