/** One event of an event stream, as a browser's `EventSource` would dispatch it. */
export interface SseEvent {
  /** The last id the stream gave, this event's or an earlier one's. "" when it gave none. */
  id: string;
  /** "message" unless the event names itself. */
  event: string;
  data: string;
}

/**
 * Reads an event stream (the HTML standard, "Server-sent events") as its text
 * arrives, in pieces cut anywhere. An event is dispatched at an empty line,
 * and only when it had a `data` field; a comment, `retry` and an unknown
 * field are no part of one. What follows the last empty line is not an event.
 */
export class SseParser {
  private rest = "";
  private started = false;
  private data: string[] | null = null;
  private event = "";
  private lastId = "";

  /** The events that `text` completes. */
  push(text: string): SseEvent[] {
    let buffer = this.rest + text;
    if (!this.started && buffer) {
      this.started = true;
      if (buffer.startsWith("﻿")) buffer = buffer.slice(1);
    }
    const events: SseEvent[] = [];
    let from = 0;
    for (;;) {
      const end = buffer.slice(from).search(/[\r\n]/);
      // A CR at the very end may be the first half of a CRLF: it waits for the next piece.
      if (end < 0 || (buffer[from + end] === "\r" && from + end === buffer.length - 1)) break;
      const at = from + end;
      const event = this.line(buffer.slice(from, at));
      if (event) events.push(event);
      from = at + (buffer[at] === "\r" && buffer[at + 1] === "\n" ? 2 : 1);
    }
    this.rest = buffer.slice(from);
    return events;
  }

  private line(line: string): SseEvent | undefined {
    if (line === "") {
      const event = this.data && { id: this.lastId, event: this.event || "message", data: this.data.join("\n") };
      this.data = null;
      this.event = "";
      return event ?? undefined;
    }
    const colon = line.indexOf(":");
    // A line that starts with a colon is a comment.
    if (colon === 0) return undefined;
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + (line[colon + 1] === " " ? 2 : 1));
    if (field === "data") (this.data ??= []).push(value);
    else if (field === "event") this.event = value;
    else if (field === "id" && !value.includes("\u0000")) this.lastId = value;
    return undefined;
  }
}

/** The events of a whole event stream that has been read already: what the Local Bridge relays. */
export function parseEventStream(text: string): SseEvent[] {
  return new SseParser().push(text);
}
