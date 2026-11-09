import { TestBed } from "@angular/core/testing";
import { ImportError, curlToRequest } from "@wayfarer/core/import";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestSave } from "../../services/request-save";
import { ImportRefused, ImportWorkerClient } from "../../shared/import/import-worker-client";
import { WorkspaceStore } from "../../state/workspace-store";
import { Tabs } from "../../state/tabs";
import { ComposerHarness, makeRequestDoc, setupComposer } from "../../../testing/composer-setup";

// P4.5: a cURL command pasted into the address field becomes the request it
// describes. The worker is stood in for by a direct call to the parser.
describe("Composer: a cURL command pasted into the address field", () => {
  let store: WorkspaceStore;
  let fixture: ComposerHarness["fixture"];
  let httpMock: ComposerHarness["httpMock"];
  let idbService: ComposerHarness["idbService"];
  let view: ComposerHarness["view"];
  const worker = {
    curl: vi.fn(async (text: string) => {
      try {
        const { content, warnings } = curlToRequest(text);
        return { content, warnings };
      } catch (error) {
        if (error instanceof ImportError) throw new ImportRefused(error.message, error.issues);
        throw error;
      }
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ store, fixture, httpMock, idbService, view } = await setupComposer([
      { provide: ImportWorkerClient, useValue: worker },
    ]));
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Pastes `text` into the address field, as the browser reports a paste. Gives whether the browser's own paste was stopped. */
  async function paste(text: string): Promise<boolean> {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>("input.address-url")!;
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    const event = new ClipboardEvent("paste", { clipboardData, cancelable: true, bubbles: true });
    input.dispatchEvent(event);
    await vi.waitFor(() =>
      expect(worker.curl.mock.results.length === 0 || store.draft().url !== "" || store.endpointError() !== "").toBe(
        true,
      ),
    );
    await fixture.whenStable();
    return event.defaultPrevented;
  }

  it("@claim:C-056 fills the composer with the method, the address, the headers, the body and the auth, and stores nothing", async () => {
    const stopped = await paste(
      `curl 'https://api.test/users?page=2' \\\n  -X PUT \\\n  -H 'Accept: application/json' \\\n  -H 'content-type: application/json' \\\n  -u ada:secret \\\n  --data-raw '{"name":"Ada"}'`,
    );

    expect(stopped).toBe(true);
    expect(store.draft()).toMatchObject({
      method: "PUT",
      url: "https://api.test/users?page=2",
      params: [{ key: "page", value: "2", enabled: true }],
      headers: [{ key: "Accept", value: "application/json", enabled: true }],
      body: { mode: "raw", raw: { language: "json", text: '{"name":"Ada"}' } },
      auth: { type: "basic", username: "ada", password: "secret" },
      scripts: { pre: "", post: "" },
    });
    expect(store.pasteNotes()).toEqual([]);
    // Nothing was stored, and nothing was sent.
    expect(idbService.add).not.toHaveBeenCalled();
    expect(TestBed.inject(RequestSave).loadedCollectionRequest()).toBeNull();
  });

  it("is a new request: a saved request that was open is no longer what Save writes to", async () => {
    const saved = TestBed.inject(RequestSave);
    saved.bind(makeRequestDoc());
    await paste("curl https://api.test/other");

    expect(saved.loadedCollectionRequest()).toBeNull();
    expect(store.draft().url).toBe("https://api.test/other");
  });

  it("goes into the tab it was pasted in, though another was opened while the command was read, and nowhere once that tab is closed", async () => {
    const tabs = TestBed.inject(Tabs);
    const answer = (text: string) => {
      let resolve!: () => void;
      const read = new Promise<void>((done) => (resolve = done));
      worker.curl.mockImplementationOnce(async () => {
        await read;
        return curlToRequest(text);
      });
      return resolve;
    };

    const pastedIn = tabs.active();
    let resolve = answer("curl https://api.test/pasted");
    const pasting = view.pasteCurl("curl https://api.test/pasted");
    tabs.open();
    const other = tabs.active();
    store.patch({ url: "https://other.test/" });
    resolve();
    await pasting;
    expect(other.draft().url).toBe("https://other.test/");
    expect(pastedIn.draft().url).toBe("https://api.test/pasted");

    tabs.open();
    const closed = tabs.active();
    resolve = answer("curl https://api.test/closed");
    const closing = view.pasteCurl("curl https://api.test/closed");
    tabs.close(closed.id);
    resolve();
    await closing;
    expect(tabs.tabs().map((tab) => tab.draft().url)).toEqual(["https://api.test/pasted", "https://other.test/"]);
  });

  it("says under the address what the command asked for that the app does not do, until the next send", async () => {
    await paste("curl -k --compressed https://api.test/ -F 'upload=@report.pdf'");

    expect(store.pasteNotes()).toHaveLength(3);
    const notes = (fixture.nativeElement as HTMLElement).querySelector(".paste-notes")?.textContent ?? "";
    expect(notes).toContain("-k (do not check the server's certificate) was left out");
    expect(notes).toContain("Choose the file again in the Body tab");
  });

  it("text that is not a cURL command is pasted as text, by the browser", async () => {
    expect(await paste("https://api.test/plain")).toBe(false);
    expect(worker.curl).not.toHaveBeenCalled();
  });

  it("a command that cannot be read says why, and the composer is left as it was", async () => {
    store.patch({ url: "https://kept.test/" });
    await paste("curl -H 'A: 1'");

    expect(store.endpointError()).toBe("The cURL command has no address.");
    expect(store.draft().url).toBe("https://kept.test/");
  });
});
