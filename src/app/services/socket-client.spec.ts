import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerHarness, buildEnvironment, setupComposer } from "../../testing/composer-setup";
import { Tabs } from "../state/tabs";
import { WorkspaceStore } from "../state/workspace-store";
import { SocketClient } from "./socket-client";

/** Stands for the browser's WebSocket: records what it was made with and sent, and is driven by the spec. */
class FakeSocket {
  static made: FakeSocket[] = [];
  static refuse: Error | null = null;
  readonly sent: unknown[] = [];
  static readonly CLOSED = 3;
  readyState = 0;
  protocol = "";
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onerror: (() => void) | null = null;
  closedWith: [number?, string?] | null = null;

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    if (FakeSocket.refuse) throw FakeSocket.refuse;
    FakeSocket.made.push(this);
  }
  send(data: unknown): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closedWith = [code, reason];
  }
  open(protocol = ""): void {
    this.readyState = 1;
    this.protocol = protocol;
    this.onopen?.();
  }
  end(code: number, reason = "", wasClean = true): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean });
  }
}

// P5.7: a WebSocket in a tab.
describe("SocketClient", () => {
  let store: WorkspaceStore;
  let environmentsService: ComposerHarness["environmentsService"];
  let vault: ComposerHarness["vault"];
  let client: SocketClient;
  let tabs: Tabs;
  const socket = () => FakeSocket.made[FakeSocket.made.length - 1];
  const log = () =>
    tabs
      .active()
      .socket.log()
      .map((entry) => [entry.direction, entry.text]);

  beforeEach(async () => {
    FakeSocket.made = [];
    FakeSocket.refuse = null;
    vi.stubGlobal("WebSocket", FakeSocket);
    ({ store, environmentsService, vault } = await setupComposer());
    client = TestBed.inject(SocketClient);
    tabs = TestBed.inject(Tabs);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("an address is a WebSocket's when it starts with ws: or wss:, as written or through a variable", () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ live: "wss://live.test" }));
    for (const [url, is] of [
      ["ws://a.test/x", true],
      ["WSS://a.test", true],
      ["{{live}}/feed", true],
      ["https://a.test", false],
      ["a.test/ws", false],
      ["", false],
    ] as const) {
      store.setUrl(url);
      expect(client.isSocket(), url).toBe(is);
    }
  });

  it("connects to the address with its variables replaced and the subprotocols asked for, and logs what happens in order", () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ host: "live.test", room: "7" }));
    store.setUrl("wss://{{host}}/rooms/{{room}}");
    const state = tabs.active().socket;
    state.protocols.set(" chat.v2 , json ");

    client.connect();
    expect(socket().url).toBe("wss://live.test/rooms/7");
    expect(socket().protocols).toEqual(["chat.v2", "json"]);
    expect(state.status()).toBe("connecting");
    socket().open("json");
    expect(state.status()).toBe("open");

    state.message.set("hello {{room}}");
    client.send();
    expect(socket().sent).toEqual(["hello 7"]);
    // What was typed stays, to be sent again or changed.
    expect(state.message()).toBe("hello {{room}}");
    socket().onmessage?.({ data: "welcome" });
    socket().onmessage?.({ data: new ArrayBuffer(12) });

    expect(log()).toEqual([
      ["info", "Connecting to wss://live.test/rooms/7"],
      ["info", "Connected. Subprotocol: json"],
      ["out", "hello 7"],
      ["in", "welcome"],
      ["in", "(binary message, 12 bytes)"],
    ]);
    const entries = state.log();
    expect(entries[2].bytes).toBe(7);
    expect(entries[3].bytes).toBe(7);
    expect(entries[4].bytes).toBe(12);
    expect(entries.every((entry) => entry.at > 0)).toBe(true);
  });

  it("Disconnect closes with 1000, and the log has the code, the reason and whether the close was clean", () => {
    store.setUrl("ws://live.test");
    client.connect();
    socket().open();
    client.disconnect();
    expect(socket().closedWith).toEqual([1000, undefined]);
    socket().end(1000, "bye");
    expect(tabs.active().socket.status()).toBe("closed");
    expect(log().at(-1)).toEqual(["info", "Closed: 1000 (normal closure), bye"]);

    client.connect();
    socket().open();
    socket().end(1006, "", false);
    expect(log().at(-1)).toEqual(["info", "Closed: 1006 (the connection was lost; no close frame arrived)"]);
  });

  it("@claim:C-007 a vault secret's reference is not sent in a message or in the address, and the vault is not read", () => {
    vault.secrets.set("s1", "plaintext-secret");
    environmentsService.setActiveEnvironment(buildEnvironment({ token: "{{$secret.s1}}" }));
    const state = tabs.active().socket;

    store.setUrl("wss://live.test/?t={{token}}");
    client.connect();
    expect(FakeSocket.made).toHaveLength(0);
    expect(state.error()).toContain("vault secret");

    store.setUrl("wss://live.test/");
    client.connect();
    socket().open();
    for (const message of ["auth {{token}}", "auth {{$secret.s1}}", "auth {{ $secret.s1 }}"]) {
      state.message.set(message);
      client.send();
    }
    expect(socket().sent).toEqual([]);
    expect(state.error()).toContain("vault secret");
    expect(vault.readSecret).not.toHaveBeenCalled();
    expect(vault.ensureUnlocked).not.toHaveBeenCalled();
    // The next message without one is sent, and the error is gone.
    state.message.set("plain");
    client.send();
    expect(socket().sent).toEqual(["plain"]);
    expect(state.error()).toBe("");
  });

  it("with JSON checked, a message that is not JSON is not sent", () => {
    store.setUrl("ws://live.test");
    client.connect();
    socket().open();
    const state = tabs.active().socket;
    state.json.set(true);
    state.message.set('{"n": 1,}');
    client.send();
    expect(socket().sent).toEqual([]);
    expect(state.error()).toBe("The message is not JSON, so it was not sent.");
    state.message.set('{"n": 1}');
    client.send();
    expect(socket().sent).toEqual(['{"n": 1}']);
  });

  it("what the browser refuses is said: a subprotocol that is no token, an address it will not open", () => {
    store.setUrl("ws://live.test");
    FakeSocket.refuse = new DOMException("The subprotocol 'a b' is invalid.", "SyntaxError");
    client.connect();
    const state = tabs.active().socket;
    expect(state.status()).toBe("closed");
    expect(state.error()).toBe("The browser did not open the connection: The subprotocol 'a b' is invalid.");
  });

  it("a socket is its tab's: another tab has none, and closing the tab closes the socket", () => {
    store.setUrl("ws://live.test");
    client.connect();
    const first = tabs.active();
    const opened = socket();
    opened.open();

    tabs.open();
    expect(tabs.active().socket.status()).toBe("closed");
    opened.onmessage?.({ data: "for the first tab" });
    expect(first.socket.log().at(-1)?.text).toBe("for the first tab");
    expect(tabs.active().socket.log()).toEqual([]);

    tabs.close(first.id);
    expect(opened.closedWith).toEqual([1000, undefined]);
  });

  // WebKit, for a port it will not connect to: an error event while the socket still says "connecting", then closed with no close event.
  it("an error that no close event follows ends the connection, once the socket says it is closed", () => {
    vi.useFakeTimers();
    try {
      store.setUrl("ws://live.test");
      client.connect();
      const state = tabs.active().socket;
      socket().onerror?.();
      expect(state.status()).toBe("connecting");
      socket().readyState = 3;
      vi.advanceTimersByTime(500);
      expect(state.status()).toBe("closed");
      expect(log().slice(-2)).toEqual([
        ["info", "The browser reported an error on the connection, and does not say what."],
        ["info", "Closed: the browser gave no close code."],
      ]);

      // A close that does follow an error is logged once, and the later look at the socket adds nothing.
      client.connect();
      socket().onerror?.();
      socket().end(1006, "", false);
      vi.advanceTimersByTime(500);
      expect(log().slice(-2)).toEqual([
        ["info", "The browser reported an error on the connection, and does not say what."],
        ["info", "Closed: 1006 (the connection was lost; no close frame arrived)"],
      ]);
      expect(state.status()).toBe("closed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("nothing is sent on a socket that is not open, and a second Connect while one is open does nothing", () => {
    store.setUrl("ws://live.test");
    const state = tabs.active().socket;
    state.message.set("early");
    client.send();
    client.connect();
    client.connect();
    expect(FakeSocket.made).toHaveLength(1);
    client.send();
    expect(socket().sent).toEqual([]);
  });
});
