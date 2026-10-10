import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScriptResult } from "@wayfarer/core";
import { WorkspaceStore } from "../../state/workspace-store";
import { ScriptSandbox } from "../../shared/scripts/script-sandbox";
import { Confirm, type ConfirmOptions } from "../../ui/confirm";
import { ComposerHarness, JSON_HEADERS, buildEnvironment, jsonBytes, rows, setupComposer } from "../../../testing/composer-setup";

// P3.9: what a send does around its scripts, as the composer shows it.
describe("Composer: a send with scripts", () => {
  const SECRET = "vault-plaintext-91c2";
  const NO_CHANGES = { environment: [], collection: [], global: [] };
  let store: WorkspaceStore;
  let fixture: ComposerHarness["fixture"];
  let httpMock: ComposerHarness["httpMock"];
  let environmentsService: ComposerHarness["environmentsService"];
  let idbService: ComposerHarness["idbService"];
  let vault: ComposerHarness["vault"];
  /** What the pre-request script of the next send does. */
  let script: Partial<ScriptResult>;
  /** What the user answers when asked, and what they were asked. */
  let answer: boolean;
  let asked: ConfirmOptions[];

  beforeEach(async () => {
    script = {};
    answer = false;
    asked = [];
    const sandbox = { execute: vi.fn(async (): Promise<ScriptResult> => ({ logs: [], changes: NO_CHANGES, testResults: [], ...script })) };
    const confirm = { confirm: vi.fn(async (options: ConfirmOptions) => (asked.push(options), answer)) };
    ({ store, fixture, httpMock, environmentsService, idbService, vault } = await setupComposer([
      { provide: ScriptSandbox, useValue: sandbox },
      { provide: Confirm, useValue: confirm },
    ]));
    vault.secrets.set("id-1", SECRET);
    environmentsService.setActiveEnvironment(buildEnvironment({ host: "api.test", token: "{{$secret.id-1}}" }));
    store.patch({ url: "https://{{host}}/items", headers: rows([{ key: "X-Token", value: "{{token}}" }]), scripts: { pre: "sign()", post: "" } });
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  const request = (url: string): ScriptResult["request"] => ({ method: "GET", url, headers: [["X-Token", "{{token}}"]], body: { mode: "none" } });
  const ok = (url: string) => httpMock.expectOne(url).flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });

  describe("a pre-request script that sends a request with a vault secret to another host (Q6)", () => {
    it("@claim:C-053 is asked about, with both hosts named; declined, nothing is sent, the vault is not read and what the script set is undone", async () => {
      script = { request: request("https://elsewhere.test/items"), changes: { ...NO_CHANGES, environment: [{ key: "seen", value: "1" }] } };

      expect(await store.send()).toBe(false);

      expect(asked).toHaveLength(1);
      expect(asked[0].message).toContain("from api.test to elsewhere.test");
      expect(asked[0].message).toContain("vault secret");
      expect(store.endpointError()).toBe("The request was not sent, and what the pre-request script set was undone.");
      expect(vault.readSecret).not.toHaveBeenCalled();
      expect(idbService.add).not.toHaveBeenCalled();
      expect(environmentsService.activeEnvironment()?.vars.map((row) => row.key)).toEqual(["host", "token"]);
      expect(store.loadingState()).toBe(false);
    });

    it("@claim:C-053 accepted, goes where the script sent it, with the secret", async () => {
      answer = true;
      script = { request: request("https://elsewhere.test/items") };

      const pending = store.send();
      await vi.waitFor(() => httpMock.expectOne("https://elsewhere.test/items"));
      const sent = httpMock.expectOne("https://elsewhere.test/items");
      expect(sent.request.headers.get("X-Token")).toBe(SECRET);
      sent.flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
      expect(await pending).toBe(true);
      expect(asked).toHaveLength(1);
    });

    it("is asked about when the host came from a variable the script set, and a declined send puts the variable back", async () => {
      script = { changes: { ...NO_CHANGES, environment: [{ key: "host", value: "elsewhere.test:8443" }] } };

      expect(await store.send()).toBe(false);

      expect(asked[0].message).toContain("from api.test to elsewhere.test:8443");
      expect(environmentsService.activeEnvironment()?.vars.find((row) => row.key === "host")?.value).toBe("api.test");

      // Send again: the variable is what it was, the script sets it again, and the question comes again.
      expect(await store.send()).toBe(false);
      expect(asked).toHaveLength(2);
    });

    it("is not asked about when the host is the same, whatever else the script changed", async () => {
      script = { request: request("https://API.test:443/other?signed=1") };
      const pending = store.send();
      // (The app hands the address over as written; the browser sends it to api.test.)
      await vi.waitFor(() => ok("https://API.test:443/other?signed=1"));
      expect(await pending).toBe(true);
      expect(asked).toEqual([]);
    });

    it("is not asked about when the request uses no vault secret", async () => {
      script = { request: { method: "GET", url: "https://elsewhere.test/items", headers: [], body: { mode: "none" } } };
      const pending = store.send();
      await vi.waitFor(() => ok("https://elsewhere.test/items"));
      expect(await pending).toBe(true);
      expect(asked).toEqual([]);
    });
  });

  it("a pre-request script that fails: nothing is sent, and the Tests tab shows its rows and its console", async () => {
    script = { error: "'notDefined' is not defined", logs: ["before the error"], testResults: [{ label: "ran first", passed: true, source: "script" }] };

    expect(await store.send()).toBe(false);

    expect(store.endpointError()).toBe("The pre-request script failed, so the request was not sent.");
    expect(store.lastTestResults().map((row) => [row.label, row.passed])).toEqual([["ran first", true], ["Pre-request script", false]]);
    expect(store.lastScriptLogs()).toEqual(["before the error"]);
    expect(store.shouldShowResponsePanel).toBe(true);
    expect(store.responseTab()).toBe("tests");
    expect(store.loadingState()).toBe(false);
    expect(idbService.add).not.toHaveBeenCalled();

    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector(".test-result-fail")?.textContent).toContain("'notDefined' is not defined");
    expect(page.querySelector(".script-console")?.textContent).toContain("before the error");
    expect(page.querySelector(".script-timings")?.textContent).toMatch(/Pre-request script \d+ ms/);
    expect(page.querySelector(".script-timings")?.textContent).not.toContain("Request");

    // The next send starts clean.
    script = {};
    store.patch({ headers: [] });
    const pending = store.send();
    await vi.waitFor(() => ok("https://api.test/items"));
    await pending;
    expect(store.endpointError()).toBe("");
    expect(store.lastTestResults()).toEqual([]);
  });

  it("shows how long each script and the request took, each by itself", async () => {
    store.patch({ headers: [], scripts: { pre: "sign()", post: "check()" } });
    const pending = store.send();
    await vi.waitFor(() => ok("https://api.test/items"));
    await pending;

    expect(Object.keys(store.lastTimings() ?? {})).toEqual(["preScriptMs", "requestMs", "postScriptMs"]);
    store.responseTab.set("tests");
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector(".script-timings")?.textContent?.replace(/\s+/g, " ").trim()).toMatch(
      /^Pre-request script \d+ ms · Request \d+ ms · Post-response script \d+ ms$/
    );
  });

  it("shows no script durations for a request without scripts", async () => {
    store.patch({ headers: [], scripts: { pre: "", post: "" } });
    const pending = store.send();
    ok("https://api.test/items");
    await pending;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector(".script-timings")).toBeNull();
  });
});
