import { afterEach, describe, expect, it, vi } from "vitest";
import { writeToClipboard } from "./clipboard.util";

describe("writeToClipboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("leaves focus where it was when it has to fall back to a hidden textarea (F49)", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("Document is not focused.", "NotAllowedError"));
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();

    await writeToClipboard("curl https://example.test");

    expect(document.activeElement).toBe(button);
    expect(document.querySelector("textarea")).toBeNull();
    button.remove();
  });
});
