import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

@Component({
  imports: [Button],
  template: `
    <button id="plain" uiButton>Save</button>
    <button id="styled" uiButton [tone]="tone()" [variant]="variant()" [size]="size()" [iconOnly]="iconOnly()" [disabled]="disabled()" aria-label="Remove">x</button>
    <label id="file" uiButton tone="secondary" variant="outlined" size="sm">Import<input type="file" /></label>
  `,
})
class TestHost {
  readonly tone = signal<"primary" | "secondary" | "danger" | "success">("danger");
  readonly variant = signal<"solid" | "outlined" | "text">("text");
  readonly size = signal<"md" | "sm">("sm");
  readonly iconOnly = signal(true);
  readonly disabled = signal(false);
}

describe("Button", () => {
  const classes = (el: Element) => [...el.classList].filter((c) => c.startsWith("ui-btn")).sort();

  it("styles a plain button as the primary, solid, medium default and leaves it a native button", async () => {
    const fixture = TestBed.createComponent(TestHost);
    await fixture.whenStable();
    const plain: HTMLButtonElement = fixture.nativeElement.querySelector("#plain");

    expect(classes(plain)).toEqual(["ui-btn"]);
    expect(plain.tagName).toBe("BUTTON");
    expect(plain.textContent).toBe("Save");
  });

  it("maps tone, variant, size and iconOnly to classes and follows changes", async () => {
    const fixture = TestBed.createComponent(TestHost);
    await fixture.whenStable();
    const styled: HTMLButtonElement = fixture.nativeElement.querySelector("#styled");

    expect(classes(styled)).toEqual(["ui-btn", "ui-btn--danger", "ui-btn--icon", "ui-btn--sm", "ui-btn--text"]);
    expect(styled.getAttribute("aria-label")).toBe("Remove");

    fixture.componentInstance.tone.set("secondary");
    fixture.componentInstance.variant.set("outlined");
    fixture.componentInstance.size.set("md");
    fixture.componentInstance.iconOnly.set(false);
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();

    expect(classes(styled)).toEqual(["ui-btn", "ui-btn--outlined", "ui-btn--secondary"]);
    expect(styled.disabled).toBe(true);

    fixture.componentInstance.tone.set("success");
    fixture.componentInstance.variant.set("solid");
    await fixture.whenStable();
    expect(classes(styled)).toEqual(["ui-btn", "ui-btn--success"]);
  });

  it("also styles a label that wraps a file input", async () => {
    const fixture = TestBed.createComponent(TestHost);
    await fixture.whenStable();
    const label: HTMLLabelElement = fixture.nativeElement.querySelector("#file");

    expect(classes(label)).toEqual(["ui-btn", "ui-btn--outlined", "ui-btn--secondary", "ui-btn--sm"]);
    expect(label.querySelector("input")?.type).toBe("file");
  });
});
