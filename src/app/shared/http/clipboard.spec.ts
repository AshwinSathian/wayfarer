import { afterEach, describe, expect, it, vi } from "vitest";
import { writeToClipboard } from "./clipboard";

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

  it("selects its textarea inside the modal dialog that has focus, where the page outside is inert", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("Document is not focused.", "NotAllowedError"));
    const dialog = document.createElement("dialog");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    dialog.showModal();
    button.focus();
    let selected = "";
    vi.spyOn(document, "execCommand").mockImplementation(() => {
      selected = `${document.activeElement?.tagName} in ${document.activeElement?.parentElement?.tagName}`;
      return true;
    });

    await writeToClipboard("curl https://example.test");

    expect(selected).toBe("TEXTAREA in DIALOG");
    expect(document.activeElement).toBe(button);
    dialog.remove();
  });
});
