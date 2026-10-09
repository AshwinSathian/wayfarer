import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PastRequest } from "../../models/history";
import { WorkspaceStore } from "../../state/workspace-store";
import { ComposerHarness, JSON_HEADERS, buildEnvironment, jsonBytes, rows, setupComposer } from "../../../testing/composer-setup";

// P2.5 with P2.8 and P2.9: a vault secret reaches the wire, and nothing
// that is stored or copied holds it (D4, D5, D21).
describe("Composer: secrets, masking and the unresolved-variable guard", () => {
  const SECRET = "vault-plaintext-91c2";
  const REFERENCE = "{{$secret.id-1}}";
  let store: WorkspaceStore;
  let httpMock: ComposerHarness["httpMock"];
  let environmentsService: ComposerHarness["environmentsService"];
  let idbService: ComposerHarness["idbService"];
  let vault: ComposerHarness["vault"];
  let settings: ComposerHarness["settings"];
  let copied: string[];

  beforeEach(async () => {
    localStorage.removeItem("wayfarer:block-unresolved");
    localStorage.removeItem("wayfarer:history-bodies");
    ({ store, httpMock, environmentsService, idbService, vault, settings } = await setupComposer());
    vault.secrets.set("id-1", SECRET);
    environmentsService.setActiveEnvironment(buildEnvironment({ token: REFERENCE }));
    copied = [];
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text: string) => void copied.push(text));
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  const recorded = () => idbService.add.mock.lastCall![0] as PastRequest;

  it("sends a protected variable as its plaintext, and history holds it nowhere: not as sent, not as composed, not in the echo", async () => {
    store.patch({
      url: "https://api.test/echo?k={{token}}",
      headers: rows([{ key: "X-Token", value: "{{token}}" }]),
      auth: { type: "basic", username: "alice", password: "{{token}}" },
    });

    const pending = store.send();
    await vi.waitFor(() => httpMock.expectOne(`https://api.test/echo?k=${SECRET}`));
    const req = httpMock.expectOne(`https://api.test/echo?k=${SECRET}`);
    expect(req.request.headers.get("X-Token")).toBe(SECRET);
    expect(atob(req.request.headers.get("Authorization")!.slice("Basic ".length))).toBe(`alice:${SECRET}`);
    // The server sends everything back, as an echo endpoint does.
    req.flush(jsonBytes({ header: SECRET, basic: btoa(`alice:${SECRET}`), url: `/echo?k=${encodeURIComponent(SECRET)}` }), {
      status: 200,
      statusText: "OK",
      // (`fetch` never shows a page `Set-Cookie`.)
      headers: { ...JSON_HEADERS, "x-auth-token": "issued-by-the-server", "x-echo": `you sent ${SECRET}` },
    });
    expect(await pending).toBe(true);

    const entry = recorded();
    const stored = JSON.stringify(entry);
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain(btoa(`alice:${SECRET}`));
    expect(stored).not.toContain(btoa(`alice:${SECRET}`).slice(4, -3));
    expect(entry.sent.url).toBe("https://api.test/echo?k=***");
    expect(entry.sent.headers).toContainEqual(["X-Token", "***"]);
    expect(entry.sent.headers).toContainEqual(["Authorization", "***"]);
    // As composed: the references, which are not secrets.
    expect(entry.template.headers).toEqual(rows([{ key: "X-Token", value: "{{token}}" }]));
    expect(entry.template.auth).toEqual({ type: "basic", username: "alice", password: "{{token}}" });
    expect(entry.response?.headers).toContainEqual(["x-auth-token", "***"]);
    expect(entry.response?.headers).toContainEqual(["x-echo", "you sent ***"]);
    expect(entry.response?.body?.text).toContain('"header":"***"');
    // What the user sees is not masked: only what is stored and copied is.
    expect(store.responseData()).toContain(SECRET);
    // What an export must look for: the vault's value, and what the credential headers carried.
    expect(store.responseExportContext()?.secrets).toEqual([SECRET]);
    expect(store.responseExportContext()?.credentials).toEqual([SECRET, SECRET, `Basic ${btoa(`alice:${SECRET}`)}`]);
  });

  it("masks a credential typed into a header where the server sends it back", async () => {
    store.patch({ url: "https://api.test/echo", headers: rows([{ key: "X-Api-Key", value: "typed-header-key" }]) });

    const pending = store.send();
    httpMock.expectOne("https://api.test/echo").flush(jsonBytes({ headers: [["x-api-key", "typed-header-key"]] }), {
      status: 200,
      statusText: "OK",
      headers: JSON_HEADERS,
    });
    await pending;

    expect(JSON.stringify(recorded())).not.toContain("typed-header-key");
    expect(recorded().response?.body?.text).toBe('{"headers":[["x-api-key","***"]]}');
    expect(store.responseExportContext()?.credentials).toEqual(["typed-header-key"]);
  });

  it("asks for the passphrase when the vault is locked, and sends once it is given", async () => {
    vault.unlocked.set(false);
    store.patch({ url: "https://api.test/", headers: rows([{ key: "X-Token", value: "{{token}}" }]) });

    const pending = store.send();
    await vi.waitFor(() => httpMock.expectOne("https://api.test/"));
    const req = httpMock.expectOne("https://api.test/");
    expect(vault.ensureUnlocked).toHaveBeenCalledTimes(1);
    expect(req.request.headers.get("X-Token")).toBe(SECRET);
    req.flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    await pending;
  });

  it("sends nothing when the unlock dialog is closed without the passphrase", async () => {
    vault.unlocked.set(false);
    vault.answer = false;
    store.patch({ url: "https://api.test/", headers: rows([{ key: "X-Token", value: "{{token}}" }]) });

    expect(await store.send()).toBe(false);

    expect(store.endpointError()).toContain("the vault is locked");
    expect(store.unresolvedBlocked()).toEqual([]);
    expect(store.loadingState()).toBe(false);
    expect(idbService.add).not.toHaveBeenCalled();
  });

  it("does not ask for the vault when the request uses no secret", async () => {
    vault.unlocked.set(false);
    store.patch({ url: "https://api.test/plain" });

    const pending = store.send();
    // Still built in the same task as the call.
    httpMock.expectOne("https://api.test/plain").flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    await pending;
    expect(vault.ensureUnlocked).not.toHaveBeenCalled();
  });

  it("holds back a request with a variable that has no value; Send anyway sends it as written, but never a secret's reference", async () => {
    store.patch({ url: "https://api.test/", headers: rows([{ key: "X-A", value: "{{nowhere}}" }, { key: "X-B", value: "{{ alsoNowhere }}" }]) });

    expect(await store.send()).toBe(false);
    expect(store.endpointError()).toBe("{{nowhere}}, {{alsoNowhere}} have no value. The request was not sent.");
    expect(store.unresolvedBlocked()).toEqual(["nowhere", "alsoNowhere"]);
    expect(idbService.add).not.toHaveBeenCalled();

    const pending = store.send({ allowUnresolved: true });
    const req = httpMock.expectOne("https://api.test/");
    expect(req.request.headers.get("X-A")).toBe("{{nowhere}}");
    req.flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    await pending;
    expect(store.unresolvedBlocked()).toEqual([]);

    // A reference to a secret the vault does not have is not a variable without a value: it is never sent.
    store.patch({ headers: rows([{ key: "X-A", value: "{{nowhere}}" }, { key: "X-S", value: "{{$secret.gone}}" }]) });
    expect(await store.send({ allowUnresolved: true })).toBe(false);
    expect(store.endpointError()).toContain("refers to a vault secret that could not be read");
  });

  it("with the guard switched off in Settings, a variable without a value is sent as written", async () => {
    settings.setBlockUnresolved(false);
    store.patch({ url: "https://api.test/{{nowhere}}" });

    const pending = store.send();
    httpMock.expectOne("https://api.test/{{nowhere}}").flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    expect(await pending).toBe(true);
    settings.setBlockUnresolved(true);
  });

  it("keeps no response body in history when that is switched off, and cuts one over 1 MB", async () => {
    store.patch({ url: "https://api.test/big" });
    let pending = store.send();
    httpMock.expectOne("https://api.test/big").flush(new TextEncoder().encode("x".repeat(1024 * 1024 + 10)).buffer, {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "text/plain" },
    });
    await pending;
    expect(recorded().response?.body).toMatchObject({ truncated: true });
    expect(recorded().response?.body?.text).toHaveLength(1024 * 1024);

    settings.setHistoryBodies(false);
    pending = store.send();
    httpMock.expectOne("https://api.test/big").flush(jsonBytes({ a: 1 }), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    await pending;
    expect(recorded().response).toEqual({ status: 200, statusText: "OK", headers: [["content-type", "application/json"]] });
    settings.setHistoryBodies(true);
  });

  it("records a form or a file body as names and sizes, never bytes", async () => {
    store.patch({ method: "POST", url: "https://api.test/form" });
    store.setBody({
      mode: "urlencoded",
      urlencoded: rows([{ key: "user", value: "alice" }, { key: "pass", value: "{{token}}" }]),
    });

    const pending = store.send();
    await vi.waitFor(() => httpMock.expectOne("https://api.test/form"));
    httpMock.expectOne("https://api.test/form").flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    await pending;

    expect(recorded().sent.bodyPreview).toBe("user=alice&pass=***");
    expect(JSON.stringify(recorded())).not.toContain(SECRET);
  });

  it("Copy as cURL masks credentials unless asked for them, and leaves a secret's reference as written", async () => {
    store.patch({
      url: "https://api.test/items?key=typed-api-key",
      headers: rows([{ key: "X-Token", value: "{{token}}" }, { key: "Accept", value: "*/*" }]),
      auth: { type: "bearer", token: "typed-bearer-token" },
    });

    await store.copyAsCurl();
    expect(copied[0]).toContain("-H 'Authorization: ***'");
    expect(copied[0]).toContain(`-H 'X-Token: ***'`);
    expect(copied[0]).toContain("-H 'Accept: */*'");
    expect(copied[0]).not.toContain("typed-bearer-token");
    expect(copied[0]).not.toContain(SECRET);
    expect(vault.readSecret).not.toHaveBeenCalled();

    await store.copyAsCurl({ credentials: true });
    expect(copied[1]).toContain("-H 'Authorization: Bearer typed-bearer-token'");
    expect(copied[1]).toContain(`-H 'X-Token: ${REFERENCE}'`);
    expect(copied[1]).not.toContain(SECRET);
  });
});
