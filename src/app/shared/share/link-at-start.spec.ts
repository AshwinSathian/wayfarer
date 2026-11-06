import { afterEach, describe, expect, it } from "vitest";
import { shareFragmentAtStart, takeShareFragment } from "./link-at-start";

describe("takeShareFragment", () => {
  const at = `${location.pathname}${location.search}`;
  afterEach(() => history.replaceState(history.state, "", at));

  it("at the start, keeps the fragment once for the app, and takes it off the address", () => {
    history.replaceState(history.state, "", `${at}#share=abc`);
    expect(takeShareFragment()).toBe("#share=abc");
    expect(location.hash).toBe("");
    expect(shareFragmentAtStart()).toBe("#share=abc");
    expect(shareFragmentAtStart()).toBeNull();
  });

  // A security review of T1: the code of a link pasted into the open app outlived its dialog in this module.
  it("from a hashchange, gives the fragment and keeps nothing of it", () => {
    history.replaceState(history.state, "", `${at}#share=xyz&key=code`);
    expect(takeShareFragment({ keep: false })).toBe("#share=xyz&key=code");
    expect(location.hash).toBe("");
    expect(shareFragmentAtStart()).toBeNull();
  });
});
