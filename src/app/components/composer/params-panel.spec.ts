import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { setupComposer } from "../../../testing/composer-setup";
import { WorkspaceStore } from "../../state/workspace-store";
import { ParamsPanel } from "./params-panel";

// L-17, L-18: the first Params row is not sent before it has a name, and Add parameter is never a dead button.
describe("the Params tab's empty row", () => {
  async function panel() {
    await setupComposer();
    const store = TestBed.inject(WorkspaceStore);
    const fixture = TestBed.createComponent(ParamsPanel);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const named = <T extends HTMLElement = HTMLInputElement>(label: string) =>
      host.querySelector<T>(`[aria-label="${label}"]`)!;
    return { store, fixture, named };
  }

  it("is unchecked until it has a name, and checked once one is typed", async () => {
    const { store, fixture, named } = await panel();
    expect(store.draft().params).toEqual([{ key: "", value: "", enabled: false }]);
    expect(named("Send this parameter").checked).toBe(false);

    const name = named("Parameter name, 1 of 1");
    name.value = "page";
    name.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    expect(store.draft().params[0]).toEqual({ key: "page", value: "", enabled: true });
    expect(named("Send page").checked).toBe(true);
  });

  it("Add parameter is enabled with an empty row there, and takes the caret to that row's name", async () => {
    const { store, named } = await panel();
    const add = named<HTMLButtonElement>("Add parameter");
    expect(add.disabled).toBe(false);
    add.click();
    expect(store.draft().params).toHaveLength(1);
    expect(document.activeElement).toBe(named("Parameter name, 1 of 1"));
  });

  it("Add parameter adds a row when every row has a name", async () => {
    const { store, fixture, named } = await panel();
    store.patch({ params: [{ key: "page", value: "", enabled: true }] });
    await fixture.whenStable();
    named<HTMLButtonElement>("Add parameter").click();
    expect(store.draft().params).toHaveLength(2);
  });
});
