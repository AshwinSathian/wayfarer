import { describe, expect, it } from "vitest";
import { setupComposer } from "../../../testing/composer-setup";

// U-170: the request's tabs were bare words, so a request with headers, a body and a script looked from Params like an
// empty one. Each tab shows a count of what it holds, or nothing (audit 9): rows sent, a body, an auth, scripts and
// tests set, settings changed. Scripts held back show a glyph in the same slot, and say so in words.
describe("the request's tabs say what they hold (U-170)", () => {
  /** Each tab's name as the DOM gives it: its text, the screen reader's words included, the drawn dot not. */
  function names(host: HTMLElement, selector: string): string[] {
    return [...host.querySelectorAll(selector)].map((tab) => {
      const copy = tab.cloneNode(true) as Element;
      copy.querySelectorAll("[aria-hidden='true'], app-icon").forEach((part) => part.remove());
      return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
    });
  }

  const full = {
    params: [
      { key: "page", value: "2", enabled: true },
      { key: "size", value: "", enabled: true },
      { key: "off", value: "1", enabled: false },
      { key: "", value: "", enabled: true },
    ],
    headers: [
      { key: "Accept", value: "*/*", enabled: true },
      { key: "X-Off", value: "1", enabled: false },
    ],
    body: { mode: "raw" as const, raw: { language: "json" as const, text: "{}" } },
    auth: { type: "bearer" as const, token: "t" },
    scripts: { pre: "", post: "pm.test('ok', () => {});" },
    settings: { followRedirects: false },
  };

  it("are bare words for an empty request", async () => {
    const { fixture } = await setupComposer();
    await fixture.whenStable();
    expect(names(fixture.nativeElement as HTMLElement, ".composer-pane [role='tab']")).toEqual([
      "Params",
      "Headers",
      "Body",
      "Auth",
      "Scripts",
      "Network",
    ]);
  });

  it("count what each tab holds", async () => {
    const { fixture, store } = await setupComposer();
    store.patch(full);
    await fixture.whenStable();
    expect(names(fixture.nativeElement as HTMLElement, ".composer-pane [role='tab']")).toEqual([
      "Params (2 set)",
      "Headers (1 set)",
      "Body (1 set)",
      "Auth (1 set)",
      "Scripts (1 set)",
      "Network (1 set)",
    ]);
  });

  it("do not mark an auth that is inherited, nor a test of its own as nothing", async () => {
    const { fixture, store } = await setupComposer();
    store.patch({
      auth: { type: "inherit" },
      tests: [{ id: "t1", target: "status", operator: "equals", expected: "200" }],
    });
    await fixture.whenStable();
    expect(names(fixture.nativeElement as HTMLElement, ".composer-pane [role='tab']").slice(3, 5)).toEqual([
      "Auth",
      "Scripts (1 set)",
    ]);
  });

  it("are the phone's section headers too", async () => {
    const { fixture, store } = await setupComposer();
    fixture.componentRef.setInput("isMobile", true);
    store.patch(full);
    await fixture.whenStable();
    expect(names(fixture.nativeElement as HTMLElement, "button.section-header")).toEqual([
      "Params (2 set)",
      "Headers (1 set)",
      "Body (1 set)",
      "Auth (1 set)",
      "Scripts (1 set)",
      "Network (1 set)",
    ]);
  });
});
