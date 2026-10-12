import { signal } from "@angular/core";

/** One line of a WebSocket's log: a message that came in or went out, or something the connection did. */
export interface SocketEntry {
  direction: "in" | "out" | "info";
  text: string;
  /** The size of a message, in bytes. */
  bytes?: number;
  /** When, in milliseconds since 1970. */
  at: number;
}

// ponytail: the log is the newest 500 lines, each arrival copying the list. A busy socket needs a virtual list.
export const SOCKET_LOG_LINES = 500;

/**
 * A tab's WebSocket (P5.7): the connection, what is about to be sent, and the
 * log. It lives in the page's memory: nothing of it is stored, and a reload
 * ends the connection.
 */
export class SocketState {
  readonly status = signal<"closed" | "connecting" | "open">("closed");
  /** The subprotocols to ask for, as typed: names parted by commas. */
  readonly protocols = signal("");
  /** The message being written. */
  readonly message = signal("");
  /** The message must be JSON to be sent. */
  readonly json = signal(false);
  /** Why the last Connect or Send did nothing. */
  readonly error = signal("");
  readonly log = signal<SocketEntry[]>([]);
  connection: WebSocket | null = null;

  add(direction: SocketEntry["direction"], text: string, bytes?: number): void {
    this.log.update((log) => [...log.slice(1 - SOCKET_LOG_LINES), { direction, text, at: Date.now(), ...(bytes !== undefined && { bytes }) }]);
  }
}
