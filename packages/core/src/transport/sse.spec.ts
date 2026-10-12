import { describe, expect, it } from "vitest";
import { SseParser, parseEventStream } from "./sse";

const all = (...chunks: string[]) => {
  const parser = new SseParser();
  return chunks.flatMap((chunk) => parser.push(chunk));
};

// The event stream format of the HTML standard (9.2, "Server-sent events"), as a browser's EventSource reads it.
describe("SseParser", () => {
  it("an event is its fields up to an empty line: id, event and data", () => {
    expect(all('id: 1\nevent: tick\ndata: {"n":1}\n\n')).toEqual([{ id: "1", event: "tick", data: '{"n":1}' }]);
  });

  it("an event without a name is a message, and several data lines are joined by a line break", () => {
    expect(all("data: one\ndata: two\n\n")).toEqual([{ id: "", event: "message", data: "one\ntwo" }]);
  });

  it("one space after the colon is not part of the value; a line without a colon is a field with no value", () => {
    expect(all("data:no space\n\n", "data:  two spaces\n\n", "data\n\n", "data\ndata\n\n")).toEqual([
      { id: "", event: "message", data: "no space" },
      { id: "", event: "message", data: " two spaces" },
      { id: "", event: "message", data: "" },
      { id: "", event: "message", data: "\n" },
    ]);
  });

  it("lines end with LF, CR or CRLF, also when a chunk ends between the CR and the LF", () => {
    expect(all("data: a\r\n\r\ndata: b\r\rdata: c\n\n")).toEqual([
      { id: "", event: "message", data: "a" },
      { id: "", event: "message", data: "b" },
      { id: "", event: "message", data: "c" },
    ]);
    expect(all("data: a\r", "\n\r", "\ndata: b\r\n", "\r\n")).toEqual([
      { id: "", event: "message", data: "a" },
      { id: "", event: "message", data: "b" },
    ]);
  });

  it("a chunk may end anywhere: in a name, in a value, in a character's line", () => {
    expect(all("da", "ta: sp", "lit\nid", ": 7\n", "\n")).toEqual([{ id: "7", event: "message", data: "split" }]);
  });

  it("a comment, an unknown field and a retry are no part of an event, and an event with no data line is none", () => {
    expect(all(": keep-alive\n\n", "retry: 3000\nfoo: bar\ndata: x\n\n", "event: named\nid: 9\n\n", "data: y\n\n")).toEqual([
      { id: "", event: "message", data: "x" },
      // The event that had no data was not one, and its name went with it; its id stays the last id.
      { id: "9", event: "message", data: "y" },
    ]);
  });

  it("the last id stays until another is given; an empty id clears it; an id with a NUL is not one", () => {
    expect(all("id: 1\ndata: a\n\n", "data: b\n\n", "id\ndata: c\n\n", "id: 5\ndata: d\n\n", "id: 6\u00007\ndata: e\n\n").map((event) => event.id)).toEqual(["1", "1", "", "5", "5"]);
  });

  it("a byte order mark at the start is not data, and what follows the last empty line is not an event", () => {
    expect(all("﻿data: a\n\n", "data: never ended\n")).toEqual([{ id: "", event: "message", data: "a" }]);
  });

  it("parseEventStream reads a whole body at once", () => {
    expect(parseEventStream("id: 1\ndata: a\n\nid: 2\nevent: done\ndata: b\n\n")).toEqual([
      { id: "1", event: "message", data: "a" },
      { id: "2", event: "done", data: "b" },
    ]);
  });
});
