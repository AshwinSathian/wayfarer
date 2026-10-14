import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerHarness, buildEnvironment, setupComposer } from "../../testing/composer-setup";
import { BridgeSettings } from "../services/bridge-settings";
import { SHOWN_EVENTS } from "./tab-state";
import { Tabs } from "./tabs";
import { WorkspaceStore } from "./workspace-store";

// P5.6: a response that is an event stream, in the tab that asked for it.
describe("an event stream in a tab", () => {
  let store: WorkspaceStore;
  let httpMock: ComposerHarness["httpMock"];
  let tabs: Tabs;
  let environmentsService: ComposerHarness["environmentsService"];
  let vault: ComposerHarness["vault"];
  const URL = "https://api.test/events";
  const SSE = { "Content-Type": "text/event-stream" };

  /** Answers the open request with a stream the spec writes to. */
  function answer(url = URL) {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start: (given) => void (controller = given) });
    const request = httpMock.expectOne(url);
    request.respond(new Response(stream, { status: 200, statusText: "OK", headers: SSE }));
    // As `fetch`: a body whose request is aborted ends in an error.
    request.request.init.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
    return { request, write: (text: string) => controller.enqueue(new TextEncoder().encode(text)), close: () => controller.close() };
  }

  beforeEach(async () => {
    ({ store, httpMock, environmentsService, vault } = await setupComposer());
    tabs = TestBed.inject(Tabs);
    store.setUrl(URL);
  });
  afterEach(() => httpMock.verify());

  it("lists each event as it arrives, while the send is still going, and the whole response when the server ends the stream", async () => {
    const sent = store.send();
    await vi.waitFor(() => httpMock.expectOne(URL));
    const stream = answer();

    stream.write("id: 1\nevent: tick\ndata: one\n\n");
    await vi.waitFor(() => expect(store.streamEvents()).toEqual([{ id: "1", event: "tick", data: "one", timeMs: expect.any(Number) }]));
    expect(store.loadingState()).toBe(true);
    expect(store.shouldShowResponsePanel).toBe(true);
    stream.write("id: 2\ndata: two\n\n");
    await vi.waitFor(() => expect(store.streamCount()).toBe(2));
    stream.close();

    expect(await sent).toBe(true);
    expect(store.loadingState()).toBe(false);
    expect(store.responseStatusCode()).toBe(200);
    expect(store.responseData()).toContain("data: two");
    expect(store.responseTab()).toBe("events");
    expect(store.streamEvents().map((event) => event.data)).toEqual(["one", "two"]);
    expect(store.streamNote()).toBe("");
  });

  it("Stop ends the stream as a response with what had arrived, and Reconnect sends the last id", async () => {
    const sent = store.send();
    await vi.waitFor(() => httpMock.expectOne(URL));
    const stream = answer();
    stream.write("id: 41\ndata: a\n\nid: 42\ndata: b\n\ndata: half");
    await vi.waitFor(() => expect(store.streamCount()).toBe(2));

    store.cancel();

    expect(await sent).toBe(true);
    expect(store.responseStatusCode()).toBe(200);
    expect(store.responseError()).toBe("");
    expect(store.streamNote()).toBe("You stopped the stream.");
    expect(store.streamEvents().map((event) => event.id)).toEqual(["41", "42"]);

    const again = store.reconnect();
    await vi.waitFor(() => httpMock.expectOne(URL));
    const second = answer();
    expect(second.request.request.headers.get("Last-Event-ID")).toBe("42");
    // The header is this send's: the request in the tab has not gained it.
    expect(store.draft().headers.some((row) => row.key.toLowerCase() === "last-event-id")).toBe(false);
    second.write("id: 43\ndata: c\n\n");
    second.close();
    expect(await again).toBe(true);
    // A reconnect is a new response: the list is its events.
    expect(store.streamEvents().map((event) => event.id)).toEqual(["43"]);
  });

  it("the events are the tab's that sent: another tab that is open by then shows none", async () => {
    const first = tabs.active();
    const sent = store.send();
    await vi.waitFor(() => httpMock.expectOne(URL));
    const stream = answer();
    tabs.open();
    stream.write("data: for the first tab\n\n");
    await vi.waitFor(() => expect(first.streamCount()).toBe(1));
    expect(store.streamEvents()).toEqual([]);
    expect(store.shouldShowResponsePanel).toBe(false);
    stream.close();
    await sent;
    expect(first.responseTab()).toBe("events");
    expect(tabs.active().responseTab()).toBe("body");
  });

  it("the list holds the newest events of a long stream, and says so", async () => {
    const sent = store.send();
    await vi.waitFor(() => httpMock.expectOne(URL));
    const stream = answer();
    stream.write(Array.from({ length: SHOWN_EVENTS + 10 }, (_, index) => `id: ${index + 1}\ndata: x\n\n`).join(""));
    stream.close();
    await sent;
    expect(store.streamCount()).toBe(SHOWN_EVENTS + 10);
    expect(store.streamEvents()).toHaveLength(SHOWN_EVENTS);
    expect(store.streamEvents()[0].id).toBe("11");
    expect(store.streamNote()).toBe(`The list holds the newest ${SHOWN_EVENTS} of ${SHOWN_EVENTS + 10} events.`);
  });

  it("a response of another type has no events, whatever its text", async () => {
    const sent = store.send();
    await vi.waitFor(() => httpMock.expectOne(URL).flush(new TextEncoder().encode("data: not a stream\n\n").buffer, { status: 200, headers: { "Content-Type": "text/plain" } }));
    await sent;
    expect(store.streamCount()).toBe(0);
    expect(store.responseTab()).toBe("body");
  });

  // The id is the server's text. Read as a template, a server could name a variable, or a vault secret, and be sent its value.
  it("the last id is sent as the server wrote it: a {{variable}} in it is not replaced, and a vault secret is not read for it", async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ token: "the-users-token" }));
    vault.secrets.set("s1", "plaintext-secret");
    const sent = store.send();
    await vi.waitFor(() => httpMock.expectOne(URL));
    const stream = answer();
    stream.write("id: {{token}} {{$secret.s1}}\ndata: a\n\n");
    stream.close();
    await sent;

    const again = store.reconnect();
    // Refused before it leaves: the text of a secret's reference is never sent (C-007), whoever wrote it.
    expect(await again).toBe(false);
    expect(vault.readSecret).not.toHaveBeenCalled();
    expect(store.endpointError()).toContain("vault secret");

    const second = store.send();
    await vi.waitFor(() => httpMock.expectOne(URL));
    const next = answer();
    next.write("id: {{token}}\ndata: b\n\n");
    next.close();
    await second;
    const third = store.reconnect();
    await vi.waitFor(() => httpMock.expectOne(URL));
    const last = answer();
    expect(last.request.request.headers.get("Last-Event-ID")).toBe("{{token}}");
    last.close();
    await third;
  });

  it("through the Local Bridge, which relays a response when it has ended, the events are read from the body and the tab says they arrived together", async () => {
    TestBed.inject(BridgeSettings).config.set({ route: 'bridge', url: "http://127.0.0.1:7717", token: "t".repeat(16) });
    const sent = store.send();
    const relay = await vi.waitFor(() => httpMock.expectOne("http://127.0.0.1:7717/v2/relay"));
    relay.flush(JSON.stringify({ status: 200, statusText: "OK", headers: [["Content-Type", "text/event-stream"]], bodyB64: btoa("id: 1\ndata: a\n\nid: 2\nevent: done\ndata: b\n\n"), encodedSize: 42, decodedSize: 42 }), { status: 200 });
    expect(await sent).toBe(true);
    expect(store.streamEvents()).toEqual([{ id: "1", event: "message", data: "a" }, { id: "2", event: "done", data: "b" }]);
    expect(store.streamNote()).toContain("Sent through the Local Bridge, which relays a response when it has ended");
    expect(store.responseTab()).toBe("events");
  });
});
