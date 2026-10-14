import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { decryptSecret, encryptSecret, newId, type VaultKey } from "@wayfarer/core";
import { version } from "../../../../package.json";
import { COMMIT } from "../../build-info";
import { IdbCore } from "../../data/idb-core";
import { DB_NAME, DB_VERSION } from "../../data/idb-schema";
import { BridgeSettings } from "../../services/bridge-settings";
import { Diagnostics, diagnosticsReport, type SelfTest } from "../../services/diagnostics";
import { StoragePersistence } from "../../services/storage-persistence";
import { ScriptSandbox } from "../../shared/scripts/script-sandbox";
import { writeToClipboard } from "../../shared/http/clipboard";
import { Icon } from "../../shared/icon/icon";

const ISSUES = "https://github.com/AshwinSathian/wayfarer/issues/new";
// A link longer than this is refused by some browsers and by GitHub.
const MAX_ISSUE_BODY = 6000;

/**
 * Settings → Diagnostics (P7.3): what is running, self-tests, and what went
 * wrong in this page's life. Everything stays in the page until the user
 * copies the report or opens an issue with it; neither holds an address, a
 * header or a body of a request (`redactMessage`).
 */
@Component({
  selector: "app-diagnostics-pane",
  imports: [DatePipe, Icon, MatButton, MatProgressSpinner],
  templateUrl: "./diagnostics-pane.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class DiagnosticsPane {
  private readonly diagnostics = inject(Diagnostics);
  private readonly storage = inject(StoragePersistence);
  private readonly core = inject(IdbCore);
  private readonly sandbox = inject(ScriptSandbox);
  private readonly bridge = inject(BridgeSettings);

  private readonly worker = signal("checking…");
  protected readonly tests = signal<SelfTest[]>([]);
  protected readonly testing = signal(false);
  protected readonly copied = signal(false);
  /** Newest first. */
  protected readonly errors = computed(() => this.diagnostics.entries().filter((entry) => entry.context !== "csp").reverse());
  protected readonly violations = computed(() => this.diagnostics.entries().filter((entry) => entry.context === "csp").reverse());

  protected readonly facts = computed<[string, string][]>(() => {
    const estimate = this.storage.estimate();
    const persisted = this.storage.persisted();
    return [
      ["Version", version],
      ["Commit", COMMIT],
      ["Browser", navigator.userAgent],
      ["Storage", `${persisted === null ? "persistence unknown" : persisted ? "persisted" : "not persisted"}${estimate ? `, ${bytes(estimate.usage)} of ${bytes(estimate.quota)}` : ""}`],
      ["Database", this.core.memoryOnly() ? "none: memory only" : `IndexedDB "${DB_NAME}", version ${DB_VERSION}`],
      ["Service worker", this.worker()],
      ["Local Bridge", `route ${this.bridge.config().route}`],
    ];
  });

  protected readonly report = computed(() => diagnosticsReport(this.facts(), this.tests(), this.diagnostics.entries()));
  protected readonly issueHref = computed(() => {
    const body = this.report();
    const cut = body.length > MAX_ISSUE_BODY ? `${body.slice(0, MAX_ISSUE_BODY)}\n\n(cut: copy the whole report from Settings → Diagnostics)` : body;
    return `${ISSUES}?title=${encodeURIComponent("Diagnostics report")}&body=${encodeURIComponent(cut)}`;
  });

  constructor() {
    void this.storage.refresh();
    void this.readWorker();
  }

  protected async copy(): Promise<void> {
    await writeToClipboard(this.report());
    this.copied.set(true);
  }

  /** Runs each self-test in turn; one that throws is a failure with its message, and the rest still run. */
  protected async runTests(): Promise<void> {
    this.testing.set(true);
    this.copied.set(false);
    const results: SelfTest[] = [];
    for (const [name, test] of [
      ["Scripts (QuickJS)", () => this.quickJs()],
      ["Vault crypto", () => this.vaultCrypto()],
      ["IndexedDB", () => this.indexedDb()],
      ["Same-origin fetch", () => this.fetchOwn()],
      ["Local Bridge", () => this.localBridge()],
    ] as const) {
      try {
        results.push({ name, ...(await test()) });
      } catch (error) {
        results.push({ name, ok: false, detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
      }
      this.tests.set([...results]);
    }
    this.testing.set(false);
  }

  private async quickJs(): Promise<Omit<SelfTest, "name">> {
    const result = await this.sandbox.execute("pm.test('sum', function () { if (1 + 1 !== 2) throw new Error('1 + 1 is ' + (1 + 1)); });", []);
    const test = result.testResults[0];
    return test?.passed ? { ok: true, detail: "1 + 1 = 2" } : { ok: false, detail: result.error ?? test?.error ?? "the script did not run" };
  }

  private async vaultCrypto(): Promise<Omit<SelfTest, "name">> {
    const key = (await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])) as VaultKey;
    const back = await decryptSecret(key, "probe", await encryptSecret(key, "probe", "round trip"));
    return back === "round trip" ? { ok: true, detail: "encrypted and decrypted with AES-GCM" } : { ok: false, detail: "the text that came back differs" };
  }

  private async indexedDb(): Promise<Omit<SelfTest, "name">> {
    const db = await this.core.getDatabase();
    if (!db) return { ok: false, detail: "this browser gives the app no storage: memory only" };
    const key = `diagnostics-${newId()}`;
    await db.put("files", { bytes: new Uint8Array([1, 2, 3]).buffer, type: "" }, key);
    const read = await db.get("files", key);
    await db.delete("files", key);
    const gone = (await db.get("files", key)) === undefined;
    return read?.bytes.byteLength === 3 && gone ? { ok: true, detail: "wrote, read and deleted a record" } : { ok: false, detail: "the record did not come back as written" };
  }

  private async fetchOwn(): Promise<Omit<SelfTest, "name">> {
    const response = await fetch("/manifest.webmanifest", { cache: "no-store" });
    return { ok: response.ok, detail: `${response.status} ${response.statusText}`.trim() };
  }

  private async localBridge(): Promise<Omit<SelfTest, "name">> {
    const { route, token } = this.bridge.config();
    if (route === "direct" || (route === "auto" && !token)) return { ok: true, detail: "not used: requests go from the page" };
    const { problem, version } = await this.bridge.health();
    return problem ? { ok: false, detail: problem } : { ok: true, detail: `answers${version ? `, version ${version}` : ""}` };
  }

  private async readWorker(): Promise<void> {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) {
      this.worker.set("none controls this page");
      return;
    }
    const cache = (await caches.keys()).find((key) => key.startsWith("wayfarer-"));
    this.worker.set(`${controller.state}${cache ? `, ${cache.slice("wayfarer-".length)}` : ""}`);
  }
}

function bytes(count: number): string {
  const units = ["B", "kB", "MB", "GB", "TB"];
  let value = count;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${unit ? value.toFixed(1) : value} ${units[unit]}`;
}
