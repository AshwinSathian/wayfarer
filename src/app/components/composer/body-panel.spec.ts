import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import type { BodyMode } from "@wayfarer/core";
import { setupComposer } from "../../../testing/composer-setup";
import { WorkspaceStore } from "../../state/workspace-store";
import { BodyPanel } from "./body-panel";

// U-200: a form body's first row is not sent before it has a name, as Params' and Headers' (L-17).
describe("a form body's empty row", () => {
  async function panel(mode: BodyMode) {
    await setupComposer();
    const store = TestBed.inject(WorkspaceStore);
    store.patch({ method: "POST" });
    const fixture = TestBed.createComponent(BodyPanel);
    (fixture.componentInstance as unknown as { setMode(mode: BodyMode): void }).setMode(mode);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const named = <T extends HTMLElement = HTMLInputElement>(label: string) =>
      host.querySelector<T>(`[aria-label="${label}"]`)!;
    const type = async (label: string, text: string) => {
      const field = named(label);
      field.value = text;
      field.dispatchEvent(new Event("input"));
      await fixture.whenStable();
    };
    return { store, fixture, named, type };
  }

  it("of a URL-encoded form is unchecked until it has a name, and checked once one is typed", async () => {
    const { store, fixture, named, type } = await panel("urlencoded");
    expect(store.draft().body.urlencoded).toEqual([{ key: "", value: "", enabled: false }]);
    expect(named("Send this field").checked).toBe(false);

    await type("Field name, 1 of 1", "q");
    expect(store.draft().body.urlencoded).toEqual([{ key: "q", value: "", enabled: true }]);
    expect(named("Send q").checked).toBe(true);

    named<HTMLButtonElement>("Add field").click();
    await fixture.whenStable();
    await type("Field name, 2 of 2", "page");
    expect(store.draft().body.urlencoded?.[1]).toEqual({ key: "page", value: "", enabled: true });
  });

  it("of a multipart form is unchecked until it has a name, and checked once one is typed", async () => {
    const { store, named, type } = await panel("multipart");
    expect(store.draft().body.multipart).toEqual([{ kind: "text", key: "", value: "", enabled: false }]);
    expect(named("Send this part").checked).toBe(false);

    await type("Part name, 1 of 1", "note");
    expect(store.draft().body.multipart).toEqual([{ kind: "text", key: "note", value: "", enabled: true }]);
    expect(named("Send note").checked).toBe(true);

    named<HTMLButtonElement>("Add part").click();
    expect(store.draft().body.multipart?.[1]).toEqual({ kind: "text", key: "", value: "", enabled: false });
  });

  it("stays as it was when a named row is renamed or emptied: the switch is the person's", async () => {
    const { store, named, type } = await panel("multipart");
    await type("Part name, 1 of 1", "note");
    named("Send note").click();
    await type("Part name, 1 of 1", "memo");
    expect(store.draft().body.multipart?.[0]).toMatchObject({ key: "memo", enabled: false });
  });
});
