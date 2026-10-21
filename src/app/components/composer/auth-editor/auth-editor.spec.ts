import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { AuthConfig } from "@wayfarer/core";
import { describe, expect, it } from "vitest";
import { AuthEditor } from "./auth-editor";

@Component({
  imports: [AuthEditor],
  template: `<app-auth-editor [auth]="auth()" (authChange)="auth.set($event)" />`,
})
class Host {
  readonly auth = signal<AuthConfig>({
    type: "awsv4",
    accessKey: "",
    secretKey: "",
    sessionToken: "",
    region: "",
    service: "",
  });
}

// Two fields filled in one frame, as a password manager fills them: the
// editor's input catches up only at the next change detection, and the
// second field was written over a copy that lacked the first (C-061 in
// WebKit on PR #313: the access key went out empty).
describe("AuthEditor: two fields filled before Angular runs", () => {
  const setUp = () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const editor = fixture.debugElement.children[0].componentInstance as AuthEditor;
    return { host: fixture.componentInstance, editor };
  };

  it("keeps both AWS keys", () => {
    const { host, editor } = setUp();
    editor.setAwsField({ accessKey: "AKIA" });
    editor.setAwsField({ secretKey: "secret" });
    expect(host.auth()).toMatchObject({ type: "awsv4", accessKey: "AKIA", secretKey: "secret" });
  });

  it("keeps both Basic fields", () => {
    const { host, editor } = setUp();
    host.auth.set({ type: "basic", username: "", password: "" });
    TestBed.tick();
    editor.setBasicUsername("alice");
    editor.setBasicPassword("pw");
    expect(host.auth()).toEqual({ type: "basic", username: "alice", password: "pw" });
  });

  it("keeps both API key fields and both OAuth 2.0 fields", () => {
    const { host, editor } = setUp();
    host.auth.set({ type: "apikey", key: "", value: "", in: "header" });
    TestBed.tick();
    editor.setApiKeyField({ key: "X-Key" });
    editor.setApiKeyField({ value: "v" });
    expect(host.auth()).toEqual({ type: "apikey", key: "X-Key", value: "v", in: "header" });

    editor.setOAuthField({ clientId: "client" });
    editor.setOAuthField({ clientSecret: "shh" });
    expect(host.auth()).toMatchObject({ type: "oauth2", clientId: "client", clientSecret: "shh" });
  });

  it("follows its input again once Angular has run: a change from outside is not undone", () => {
    const { host, editor } = setUp();
    editor.setAwsField({ accessKey: "AKIA" });
    TestBed.tick();
    host.auth.set({ type: "awsv4", accessKey: "OTHER", secretKey: "", sessionToken: "", region: "", service: "" });
    TestBed.tick();
    editor.setAwsField({ region: "eu-west-1" });
    expect(host.auth()).toMatchObject({ accessKey: "OTHER", region: "eu-west-1" });
  });
});
