import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { BridgeSetup } from "./bridge-setup";

// U-159: the failure's set-up gave a command and a pairing code, and left out what the bridge needs: a terminal and
// Node.js, Chrome's and Edge's question about the local network, and Safari's HTTPS.
describe("BridgeSetup", () => {
  it("says the bridge needs a terminal and Node.js, and what Chrome, Edge and Safari ask of it", async () => {
    const fixture = TestBed.createComponent(BridgeSetup);
    await fixture.whenStable();
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("in a terminal");
    expect(text).toContain("Node.js 22.21 or later");
    expect(text).toContain("local network");
    expect(text).toContain("Safari reaches the bridge only over HTTPS");
  });
});
