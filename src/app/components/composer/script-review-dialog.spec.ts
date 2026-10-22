import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { scriptDigest } from "@wayfarer/core";
import { describe, expect, it, vi } from "vitest";
import { ScriptTrust, type ReviewedScripts } from "../../services/script-trust";
import { ScriptReviewDialog } from "./script-review-dialog";

// U-040: each script on its own, which of them the last review did not cover, and what of Postman's it uses that
// the app does not have.
describe("ScriptReviewDialog", () => {
  it("lists each script under its holder, marks the ones not reviewed and the calls the app does not have", async () => {
    const reviewed = "pm.environment.set('seen', 'yes');";
    const toReview = signal<ReviewedScripts[]>([
      { kind: "collection", name: "Collection Shared", pre: "pm.vault.get('k')", post: "" },
      { kind: "request", name: "Health", pre: reviewed, post: "pm.test('ok', () => {});" },
    ]);
    const approvedDigests = signal(new Set([await scriptDigest(reviewed)]));
    TestBed.configureTestingModule({
      imports: [ScriptReviewDialog],
      providers: [{ provide: ScriptTrust, useValue: { toReview, approvedDigests, approve: () => Promise.resolve() } }],
    });
    const fixture = TestBed.createComponent(ScriptReviewDialog);
    fixture.componentRef.setInput("visible", true);
    await fixture.whenStable();
    // The digests are WebCrypto's, a task or more after the first render.
    await vi.waitFor(() => expect(fixture.nativeElement.querySelectorAll(".script-review-new")).toHaveLength(2));
    const host = fixture.nativeElement as HTMLElement;
    const items = [...host.querySelectorAll(".script-review-list li")];
    const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();

    const heading = (item: Element) => [...item.querySelectorAll("div > span")].map((span) => text(span)).join(" ");
    expect(items.map(heading)).toEqual([
      "Collection Shared Pre-request script Not reviewed yet",
      "Health Pre-request script",
      "Health Post-response script Not reviewed yet",
    ]);
    expect(items.map((item) => item.querySelector(".script-review-code code")?.textContent)).toEqual([
      "pm.vault.get('k')",
      reviewed,
      "pm.test('ok', () => {});",
    ]);
    expect(text(items[0].querySelector(".script-review-unsupported"))).toBe(
      "Uses what Wayfarer does not have: pm.vault.get.",
    );
    expect(items[1].querySelector(".script-review-unsupported")).toBeNull();
  });
});
