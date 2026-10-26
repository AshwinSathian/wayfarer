import { Injectable, computed, inject } from "@angular/core";
import { VariableNestingError, parseJson } from "@wayfarer/core";
import { Tabs } from "../state/tabs";
import { WorkspaceStore } from "../state/workspace-store";
import { containsSecretPlaceholder } from "@wayfarer/core";

/** What a close code says, for the ones a person meets (RFC 6455, 7.4.1). */
const CLOSE_CODES: Record<number, string> = {
  1000: "normal closure",
  1001: "the other side is going away",
  1002: "protocol error",
  1003: "a kind of data it does not take",
  1005: "no code was given",
  1006: "the connection was lost; no close frame arrived",
  1007: "data that is not what its type says",
  1008: "its policy was broken",
  1009: "a message too large",
  1011: "the server met an error",
  1015: "the TLS handshake failed",
};

/** How long after an error a close event is waited for before the socket itself is asked. In Chromium and Firefox the two come together. */
const ERROR_WITHOUT_CLOSE_MS = 500;

const NO_SECRET =
  "A WebSocket cannot carry a vault secret: the reference would go out as text, so nothing was sent. Type the value, or use a variable that is not protected.";

/**
 * The open tab's WebSocket (P5.7): a tab whose address starts with `ws:` or
 * `wss:` connects instead of sending. The browser's own `WebSocket` makes
 * the connection, directly: no header can be added to its handshake, so the
 * request's headers and auth do not go with it.
 *
 * `{{variables}}` are replaced in the address and in a message. The vault is
 * never read for either: a secret's reference is refused (C-007), since it
 * would go on the wire as that text.
 */
@Injectable({ providedIn: "root" })
export class SocketClient {
  private readonly tabs = inject(Tabs);
  private readonly store = inject(WorkspaceStore);

  /** The open tab's address is a WebSocket's. */
  readonly isSocket = computed(() => {
    const tab = this.tabs.active();
    return !tab.run && /^wss?:/i.test(this.resolved(tab.draft().url.trim()) ?? "");
  });

  /** `text` with the open tab's variables replaced, or undefined when they refer to each other in a circle. */
  private resolved(text: string): string | undefined {
    try {
      return this.store.resolvePlain(this.tabs.active(), text);
    } catch (error) {
      if (!(error instanceof VariableNestingError)) throw error;
      return undefined;
    }
  }

  connect(): void {
    const tab = this.tabs.active();
    const state = tab.socket;
    if (state.status() !== "closed") return;
    state.error.set("");
    const url = this.resolved(tab.draft().url.trim());
    if (url === undefined)
      return state.error.set("The address uses variables that refer to each other, so nothing was opened.");
    if (containsSecretPlaceholder({ url, headers: [] })) return state.error.set(NO_SECRET);
    const protocols = state
      .protocols()
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url, protocols);
    } catch (error) {
      // A subprotocol that is no token, an address that is no URL, ws: from an https page: the browser says which.
      if (!(error instanceof Error)) throw error;
      return state.error.set(`The browser did not open the connection: ${error.message}`);
    }
    socket.binaryType = "arraybuffer";
    state.connection = socket;
    state.status.set("connecting");
    state.add("info", `Connecting to ${url}`);
    socket.onopen = () => {
      state.status.set("open");
      state.add("info", socket.protocol ? `Connected. Subprotocol: ${socket.protocol}` : "Connected.");
    };
    socket.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (typeof data === "string") state.add("in", data, new TextEncoder().encode(data).length);
      else {
        const bytes = data instanceof ArrayBuffer ? data.byteLength : data instanceof Blob ? data.size : 0;
        state.add("in", `(binary message, ${bytes} bytes)`, bytes);
      }
    };
    const ended = (line: string) => {
      // Once: a close may follow an error that already ended it.
      if (state.connection !== socket) return;
      state.status.set("closed");
      state.connection = null;
      state.add("info", line);
    };
    // The browser says nothing of why. A close with the code follows, except where it does not: for a port it
    // refuses to connect to, WebKit gives this event alone (measured: the socket still says "connecting" then,
    // and is closed a moment later with no close event). So the socket is looked at again shortly after.
    socket.onerror = () => {
      state.add("info", "The browser reported an error on the connection, and does not say what.");
      setTimeout(() => {
        if (socket.readyState === WebSocket.CLOSED) ended("Closed: the browser gave no close code.");
      }, ERROR_WITHOUT_CLOSE_MS);
    };
    socket.onclose = ({ code, reason }: CloseEvent) => {
      const meaning = Object.hasOwn(CLOSE_CODES, code) ? ` (${CLOSE_CODES[code]})` : "";
      ended(`Closed: ${code}${meaning}${reason ? `, ${reason}` : ""}`);
    };
  }

  /** Sends the message being written, its variables replaced. It stays in the field. */
  send(): void {
    const state = this.tabs.active().socket;
    if (state.status() !== "open" || !state.connection) return;
    state.error.set("");
    const text = this.resolved(state.message());
    if (text === undefined)
      return state.error.set("The message uses variables that refer to each other, so it was not sent.");
    if (containsSecretPlaceholder({ url: "", headers: [], body: text })) return state.error.set(NO_SECRET);
    if (state.json() && !parseJson(text).ok) return state.error.set("The message is not JSON, so it was not sent.");
    state.connection.send(text);
    state.add("out", text, new TextEncoder().encode(text).length);
  }

  disconnect(): void {
    this.tabs.active().socket.connection?.close(1000);
  }
}
