import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { TabMark, type TabMarkValue } from "./tab-mark";

// Audit 9: one slot, a count or nothing; scripts held back put a glyph in the same slot. Its width is the stylesheet's,
// which a unit test does not load: e2e/tab-badges.spec.ts holds that the tabs keep their width.
describe("the mark after a request tab's name", () => {
  async function slot(mark: TabMarkValue): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(TabMark);
    fixture.componentRef.setInput("mark", mark);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement.querySelector(".tab-badge");
  }

  it("is a count, or nothing", async () => {
    expect((await slot(3)).textContent?.trim()).toBe("3");
    expect((await slot(null)).textContent?.trim()).toBe("");
  });

  it("puts the warning glyph and its words in the same slot when scripts are held", async () => {
    const held = await slot("held");
    expect(held.querySelector("app-icon")).not.toBeNull();
    expect(held.textContent).toContain("(not reviewed)");
  });
});
