import { ComponentFixture, TestBed } from "@angular/core/testing";
import { rowsOf } from "../../../testing/request-fixtures";
import { signal } from "@angular/core";
import { EnvironmentsManager } from "./environments-manager";
import { EnvironmentsStore } from "../../services/environments-store";
import { SecretsVault } from "../../services/secrets-vault";
import { EnvironmentDoc } from "@wayfarer/core";
import { describe, it, beforeEach, expect, vi } from "vitest";

function makeEnv(id: string, vars: Record<string, string> = {}): EnvironmentDoc {
  return {
    id,
    meta: { id, createdAt: 1, updatedAt: 1 },
    name: `Env ${id}`,
    vars: rowsOf(vars),
    order: 0,
  };
}

class EnvironmentsServiceStub {
  private readonly environmentsState = signal<EnvironmentDoc[]>([]);
  private readonly activeState = signal<EnvironmentDoc | null>(null);
  readonly environments = this.environmentsState.asReadonly();
  readonly activeEnvironment = this.activeState.asReadonly();
  readonly globals = signal([]);
  readonly loading = signal(false);

  readonly createCalls: unknown[] = [];
  readonly updateCalls: { id: string; updates: unknown }[] = [];
  readonly duplicateCalls: string[] = [];
  readonly deleteCalls: string[] = [];
  readonly setActiveCalls: (string | null)[] = [];

  setEnvironments(envs: EnvironmentDoc[]): void {
    this.environmentsState.set(envs);
  }

  setActive(env: EnvironmentDoc | null): void {
    this.activeState.set(env);
  }

  async ensureLoaded(): Promise<void> {
    // no-op — environments are set directly via setEnvironments() in tests
  }

  async createEnvironment(payload: {
    name: string;
    description?: string;
    vars?: Record<string, string>;
  }): Promise<EnvironmentDoc> {
    this.createCalls.push(payload);
    const doc = makeEnv("new-env", payload.vars ?? {});
    this.environmentsState.update((envs) => [...envs, doc]);
    return doc;
  }

  async updateEnvironment(
    id: string,
    updates: Partial<Pick<EnvironmentDoc, "name" | "description" | "vars">>,
  ): Promise<EnvironmentDoc | null> {
    this.updateCalls.push({ id, updates });
    return null;
  }

  readonly changeCalls: { id: string; changes: unknown; details: unknown }[] = [];
  /** What the stored environment is after the change, as another tab may have left it. */
  changeResult: EnvironmentDoc | null = null;

  async changeEnvironment(id: string, changes: unknown, details: unknown): Promise<EnvironmentDoc | null> {
    this.changeCalls.push({ id, changes, details });
    // As the store does: it has read the environments again by the time a change returns.
    const result = this.changeResult;
    if (result) {
      this.environmentsState.update((envs) => envs.map((env) => (env.meta.id === id ? result : env)));
    }
    return result;
  }

  async duplicateEnvironment(id: string): Promise<EnvironmentDoc | null> {
    this.duplicateCalls.push(id);
    return null;
  }

  async deleteEnvironment(id: string): Promise<void> {
    this.deleteCalls.push(id);
  }

  async setActiveEnvironment(id: string | null): Promise<void> {
    this.setActiveCalls.push(id);
  }
}

class SecretsServiceStub {
  unlocked = true;
  vault = true;
  /** What the unlock dialog answers. */
  unlockAnswer = false;
  createdWith: string[] = [];
  isUnlocked = (): boolean => this.unlocked;
  exists = async (): Promise<boolean> => this.vault;
  ensureUnlocked = async (): Promise<boolean> => {
    if (this.unlockAnswer) this.unlocked = true;
    return this.unlocked;
  };
  create = async (passphrase: string): Promise<boolean> => {
    this.createdWith.push(passphrase);
    this.vault = true;
    this.unlocked = true;
    return true;
  };
  savedSecrets: { name: string; environmentId: string; plaintext: string }[] = [];
  private nextId = 1;

  async saveSecret(request: { name: string; environmentId: string; plaintext: string }): Promise<string> {
    this.savedSecrets.push(request);
    return `secret-${this.nextId++}`;
  }

  async readSecret(secretId: string): Promise<string | null> {
    const match = this.savedSecrets.find((_, i) => `secret-${i + 1}` === secretId);
    return match?.plaintext ?? null;
  }
}

describe("EnvironmentsManager", () => {
  let component: EnvironmentsManager;
  let fixture: ComponentFixture<EnvironmentsManager>;
  let envService: EnvironmentsServiceStub;
  let secretsService: SecretsServiceStub;

  beforeEach(async () => {
    envService = new EnvironmentsServiceStub();
    secretsService = new SecretsServiceStub();

    await TestBed.configureTestingModule({
      imports: [EnvironmentsManager],
      providers: [
        { provide: EnvironmentsStore, useValue: envService },
        { provide: SecretsVault, useValue: secretsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EnvironmentsManager);
    component = fixture.componentInstance;
  });

  describe("selecting an environment", () => {
    it("builds a draft (pairs + pretty JSON) from the selected environment's vars", () => {
      const env = makeEnv("e1", { API_KEY: "abc", BASE_URL: "https://example.com" });
      envService.setEnvironments([env]);

      component.selectEnvironment("e1");

      expect(component.selectedId()).toBe("e1");
      const draft = component.draft();
      expect(draft?.vars).toEqual([
        { key: "API_KEY", value: "abc", enabled: true },
        { key: "BASE_URL", value: "https://example.com", enabled: true },
      ]);
      expect(draft?.jsonValid).toBe(true);
      expect(JSON.parse(draft!.jsonText)).toEqual({ API_KEY: "abc", BASE_URL: "https://example.com" });
    });

    it("auto-selects the active environment on construction if nothing is selected yet", () => {
      const env = makeEnv("e1");
      envService.setEnvironments([env]);
      envService.setActive(env);

      // The auto-select effect runs on the next change-detection tick.
      fixture.detectChanges();

      expect(component.selectedId()).toBe("e1");
    });
  });

  describe("editing variables", () => {
    beforeEach(() => {
      envService.setEnvironments([makeEnv("e1", { A: "1" })]);
      component.selectEnvironment("e1");
    });

    it("addVariable appends a blank pair and removeVariable removes by index", () => {
      component.addVariable();
      expect(component.draft()?.vars.length).toBe(2);

      component.removeVariable(0);
      expect(component.draft()?.vars).toEqual([{ key: "", value: "", enabled: true }]);
    });

    it("onJsonChange replaces the pairs from valid parsed JSON", () => {
      component.onJsonChange('{"X":"y"}', true, { X: "y" });

      expect(component.draft()?.vars).toEqual([{ key: "X", value: "y", enabled: true }]);
    });

    it("onJsonChange leaves vars untouched when the JSON is invalid", () => {
      const before = component.draft()?.vars;
      component.onJsonChange("{not json", false, undefined);

      expect(component.draft()?.vars).toEqual(before!);
      expect(component.draft()?.jsonValid).toBe(false);
    });

    it("commit() sends a trimmed name and only what changed: an untouched variable is not written again", async () => {
      component.draft.update((d) => (d ? { ...d, name: "  Renamed  " } : d));
      component.addVariable();

      await component.commit();

      // A is as it was loaded and the added row has no name: nothing to change.
      expect(envService.changeCalls).toEqual([
        { id: "e1", changes: [], details: { name: "Renamed", description: "" } },
      ]);
      expect(envService.updateCalls).toEqual([]);
    });

    it("commit() sends a set for an edited or added variable and a removal for a deleted one, then shows what is stored", async () => {
      const draft = component.draft()!;
      draft.vars[0].value = "2";
      draft.vars.push({ key: " B ", value: "new", enabled: true });
      // Another tab saved C meanwhile; the stored document has it.
      envService.changeResult = makeEnv("e1", { A: "2", B: "new", C: "theirs" });

      await component.commit();

      expect(envService.changeCalls[0].changes).toEqual([
        { key: "A", value: "2" },
        { key: "B", value: "new" },
      ]);
      expect(component.draft()?.vars.map((row) => row.key.trim())).toEqual(["A", "B", "C"]);

      component.removeVariable(0);
      await component.commit();
      expect(envService.changeCalls[1].changes).toEqual([{ key: "A", value: null }]);
    });

    it("after a save shows what the store holds now, not the older document the save returned (F62)", async () => {
      component.draft()!.vars.push({ key: "mine", value: "1", enabled: true });
      // Another tab's save landed after this one's write and before it returned:
      // the store has already read it, and the save still returns its own, older result.
      envService.changeEnvironment = async () => {
        envService.setEnvironments([makeEnv("e1", { A: "1", mine: "1", theirs: "2" })]);
        await fixture.whenStable();
        return makeEnv("e1", { A: "1", mine: "1" });
      };

      await component.commit();
      await fixture.whenStable();

      expect(component.draft()?.vars.map((row) => row.key)).toEqual(["A", "mine", "theirs"]);
    });

    it("shows a change made elsewhere to the open environment, but not over edits that are not saved yet", async () => {
      envService.setEnvironments([makeEnv("e1", { A: "1", fromElsewhere: "x" })]);
      await fixture.whenStable();
      expect(component.draft()?.vars.map((row) => row.key)).toEqual(["A", "fromElsewhere"]);

      component.draft()!.vars[0].value = "mine";
      envService.setEnvironments([makeEnv("e1", { A: "theirs", fromElsewhere: "x" })]);
      await fixture.whenStable();
      expect(component.draft()?.vars[0].value).toBe("mine");
    });

    it("keeps a new row that has no name yet while another row is edited (F59)", async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      component.addVariable();
      component.draft()!.vars[0].value = "2";
      component.onPairsChange();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.draft()?.vars).toEqual([
        { key: "A", value: "2", enabled: true },
        { key: "", value: "", enabled: true },
      ]);
    });

    it("opening an environment keeps a switched-off variable and a name that is there twice (F59)", async () => {
      const rows = [
        { key: "off", value: "1", enabled: false },
        { key: "twice", value: "first", enabled: true },
        { key: "twice", value: "second", enabled: true },
      ];
      envService.setEnvironments([{ ...makeEnv("e2"), vars: rows }]);
      component.selectEnvironment("e2");
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.draft()?.vars).toEqual(rows);

      component.draft()!.vars[1].value = "edited";
      component.onPairsChange();
      fixture.detectChanges();
      await fixture.whenStable();
      await component.commit();

      // Nothing the store would see changed, so nothing is written, and the switched-off row stays off.
      expect(envService.changeCalls).toEqual([]);
      expect(component.draft()?.vars[0]).toEqual(rows[0]);
    });

    it("commit() is a no-op when the draft's JSON is currently invalid", async () => {
      component.onJsonChange("{broken", false, undefined);

      await component.commit();

      expect(envService.updateCalls).toEqual([]);
    });
  });

  describe("secret-protected variables", () => {
    beforeEach(() => {
      envService.setEnvironments([makeEnv("e1", { TOKEN: "raw-value" })]);
      component.selectEnvironment("e1");
    });

    it("isSecretValue/getSecretPreview recognize the {{$secret.<id>}} placeholder format", () => {
      expect(component.isSecretValue("{{$secret.abc-123}}")).toBe(true);
      expect(component.isSecretValue("plain text")).toBe(false);
      expect(component.isSecretValue(undefined)).toBe(false);
    });

    it("protectVariable replaces the plaintext value with a {{$secret.<id>}} placeholder when unlocked", async () => {
      secretsService.unlocked = true;

      await component.protectVariable(0);

      expect(secretsService.savedSecrets).toEqual([{ name: "TOKEN", environmentId: "e1", plaintext: "raw-value" }]);
      expect(component.draft()?.vars[0].value).toMatch(/^\{\{\$secret\.secret-1\}\}$/);
    });

    it("warns when a protected value is shorter than 6 characters, and not for a longer one (R5)", async () => {
      component.draft()!.vars[0].value = "12345";
      await component.protectVariable(0);
      expect(component.shortSecretWarning()).toBe("TOKEN");

      component.draft()!.vars.push({ key: "LONG", value: "123456", enabled: true });
      await component.protectVariable(1);
      expect(component.shortSecretWarning()).toBeNull();
    });

    it("protectVariable asks for the vault to be unlocked, and saves nothing when it is not", async () => {
      secretsService.unlocked = false;

      await component.protectVariable(0);

      expect(secretsService.savedSecrets).toEqual([]);
      expect(component.draft()?.vars[0].value).toBe("raw-value");
    });

    it("protectVariable marks the row once the vault it asked for is unlocked, and writes the reference at once", async () => {
      secretsService.unlocked = false;
      secretsService.unlockAnswer = true;

      await component.protectVariable(0);

      expect(component.draft()?.vars[0].value).toBe("{{$secret.secret-1}}");
      expect(envService.changeCalls.at(-1)?.changes).toEqual([{ key: "TOKEN", value: "{{$secret.secret-1}}" }]);
    });

    // U-135 and U-136: with no vault, the row asks for a passphrase itself, and the row ends as a reference.
    it("with no vault, asks for a passphrase in the row, makes the vault and stores the row as a reference", async () => {
      secretsService.unlocked = false;
      secretsService.vault = false;

      await component.protectVariable(0);
      expect(component.vaultFor()).toBe(0);
      expect(secretsService.savedSecrets).toEqual([]);

      component.vaultPassphrase.set("long enough");
      component.vaultConfirmation.set("not the same");
      await component.createVaultForRow();
      expect(component.vaultError()).toBe("The passphrases do not match.");
      expect(secretsService.createdWith).toEqual([]);

      component.vaultConfirmation.set("long enough");
      await component.createVaultForRow();
      expect(secretsService.createdWith).toEqual(["long enough"]);
      expect(component.vaultFor()).toBeNull();
      expect(envService.changeCalls.at(-1)?.changes).toEqual([{ key: "TOKEN", value: "{{$secret.secret-1}}" }]);
    });

    it("a row whose lock is pressed is not written as plain text on the way to the vault", async () => {
      secretsService.unlocked = false;
      secretsService.vault = false;
      component.draft()!.vars.push({ key: "NEW", value: "plain", enabled: true });
      // The press comes before the field's blur.
      component.holdForSecret(1);
      component.onFocusOut(new FocusEvent("focusout"));
      await component.protectVariable(1);
      component.onFocusOut(new FocusEvent("focusout"));
      await component.commit();
      expect(JSON.stringify(envService.changeCalls)).not.toContain("plain");
      component.cancelVaultForRow();
      await component.commit();
      expect(JSON.stringify(envService.changeCalls)).toContain("plain");
    });

    it("a row with no name says why it cannot be marked", async () => {
      component.draft()!.vars.push({ key: "", value: "v", enabled: true });
      await component.protectVariable(1);
      expect(component.protectProblem()).toEqual({
        index: 1,
        text: "A variable needs a name and a value to be kept as a secret.",
      });
    });

    // C-053's stall in WebKit (e2e/FLAKES.md): a second click on "Mark variable as secret" changed nothing for 15 s,
    // and nothing said whether it reached the save. Each way the click goes is written to the console, for a trace.
    it("protectVariable says in the console which way it went", async () => {
      const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
      try {
        secretsService.unlocked = false;
        await component.protectVariable(0);
        secretsService.unlocked = true;
        await component.protectVariable(0);
        component.draft()!.vars.push({ key: "", value: "", enabled: true });
        await component.protectVariable(1);
        expect(debug.mock.calls.map((call) => call.join(" "))).toEqual([
          "[wayfarer] mark as secret: the vault is locked, asking to unlock",
          "[wayfarer] mark as secret: saving",
          "[wayfarer] mark as secret: the row has no name or no value",
        ]);
      } finally {
        debug.mockRestore();
      }
    });

    it("revealSecret fetches and caches the plaintext for a protected variable", async () => {
      secretsService.unlocked = true;
      await component.protectVariable(0);
      const placeholder = component.draft()!.vars[0].value;

      await component.revealSecret(0);

      expect(component.getSecretPreview(placeholder)).toBe("raw-value");
    });
  });

  // U-060 and DQ9: there is no Save button; nothing typed is lost to a close or to choosing another environment.
  describe("writing as it goes", () => {
    beforeEach(() => {
      envService.setEnvironments([makeEnv("e1", { A: "1" }), makeEnv("e2", { B: "2" })]);
      component.selectEnvironment("e1");
    });

    it("writes an edit when the editor is destroyed (× and Escape)", async () => {
      component.draft()!.vars[0].value = "typed";
      fixture.destroy();
      await Promise.resolve();
      await vi.waitFor(() => expect(envService.changeCalls).toHaveLength(1));
      expect(envService.changeCalls[0].changes).toEqual([{ key: "A", value: "typed" }]);
    });

    it("writes the environment being left when another is chosen", async () => {
      component.draft()!.vars[0].value = "typed";
      component.selectEnvironment("e2");
      await vi.waitFor(() => expect(envService.changeCalls).toHaveLength(1));
      expect(envService.changeCalls[0].id).toBe("e1");
      expect(component.draft()?.id).toBe("e2");
    });

    it("says so under the editor when the browser refuses the write, and keeps the edit", async () => {
      envService.changeEnvironment = async () => {
        throw new DOMException("quota", "QuotaExceededError");
      };
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      component.draft()!.vars[0].value = "typed";
      await component.commit();
      expect(component.saveError()).toBe(
        "Env e1 was not saved: this browser refused the write. Your edits are still here.",
      );
      expect(component.draft()?.vars[0].value).toBe("typed");
    });

    it("says when the environment was deleted in another tab", async () => {
      envService.changeResult = null;
      component.draft()!.vars[0].value = "typed";
      await component.commit();
      expect(component.saveError()).toBe("Env e1 was not saved: it was deleted in another tab.");
    });

    it("a row with a value and no name, or a name and no value, says so", () => {
      expect(component.rowNote({ key: "", value: "x", enabled: true })).toBe(
        "This row has no name, so it is not kept. Give it one.",
      );
      expect(component.rowNote({ key: "k", value: "", enabled: true })).toBe("This variable is empty.");
      expect(component.rowNote({ key: "", value: "", enabled: true })).toBeNull();
    });
  });

  it("keeps what was typed while a write was on its way", async () => {
    envService.setEnvironments([makeEnv("e1", { A: "1" })]);
    component.selectEnvironment("e1");
    component.draft()!.vars[0].value = "first";
    envService.changeEnvironment = async (id, changes, details) => {
      envService.changeCalls.push({ id, changes, details });
      // Typed into the next field while the write is on its way.
      component.draft()!.vars[0].value = "second";
      envService.setEnvironments([makeEnv("e1", { A: "first" })]);
      return makeEnv("e1", { A: "first" });
    };
    await component.commit();
    expect(component.draft()?.vars[0].value).toBe("second");
  });

  describe("lifecycle actions", () => {
    it("duplicate() selects the newly-created copy", async () => {
      const env = makeEnv("e1");
      const copy = makeEnv("e1-copy");
      envService.duplicateEnvironment = async () => copy;
      envService.setEnvironments([env]);

      await component.duplicate(env);

      expect(component.selectedId()).toBe("e1-copy");
    });

    it("setActive() delegates to EnvironmentsStore.setActiveEnvironment", async () => {
      const env = makeEnv("e1");

      await component.setActive(env);

      expect(envService.setActiveCalls).toEqual(["e1"]);
    });
  });
});
