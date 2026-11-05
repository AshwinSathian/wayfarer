import { describe, expect, it } from "vitest";
import { editorText } from "./monaco-loader";

describe("editorText", () => {
  it("gives every editor no overview ruler and no room past the last line (U-186)", () => {
    expect(editorText()).toEqual(
      expect.objectContaining({
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        scrollBeyondLastLine: false,
      }),
    );
  });
});
