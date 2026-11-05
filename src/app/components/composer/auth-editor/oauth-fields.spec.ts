import { TestBed } from "@angular/core/testing";
import { emptyAuth, type AuthConfig } from "@wayfarer/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthRedirectUri } from "../../../services/oauth-tokens";
import { OAuthFields } from "./oauth-fields";

// U-176: the redirect URI was text that broke anywhere ("htt / p://…"), with no Copy, though a person must paste it
// into the identity provider. It is a read-only field with Copy, which says what it did.
describe("OAuthFields: the redirect URI", () => {
  afterEach(() => vi.restoreAllMocks());

  async function fields() {
    const fixture = TestBed.createComponent(OAuthFields);
    fixture.componentRef.setInput("auth", emptyAuth("oauth2") as Extract<AuthConfig, { type: "oauth2" }>);
    fixture.componentRef.setInput("subject", "collection");
    await fixture.whenStable();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it("is a read-only field named by its label, holding the URI", async () => {
    const { host } = await fields();
    const field = host.querySelector<HTMLInputElement>("input.oauth-redirect-uri");
    expect(field?.readOnly).toBe(true);
    expect(field?.value).toBe(oauthRedirectUri());
    expect(field?.labels?.[0]?.textContent?.trim()).toBe("Register this redirect URI with the identity provider");
  });

  it("has Copy, which writes the URI to the clipboard and says so", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { fixture, host } = await fields();
    host.querySelector<HTMLButtonElement>('button[aria-label="Copy the redirect URI"]')?.click();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith(oauthRedirectUri()));
    await fixture.whenStable();
    expect(host.querySelector('[role="status"]')?.textContent?.trim()).toBe("Copied the redirect URI.");
  });
});
