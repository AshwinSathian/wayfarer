import { ComponentFixture, TestBed } from "@angular/core/testing";
import { rowsOf } from "../../../testing/request-fixtures";
import { signal } from "@angular/core";
import { Subject } from "rxjs";
import { EnvironmentsManager } from "./environments-manager";
import { EnvironmentsStore } from "../../services/environments-store";
import { SecretsVault } from "../../services/secrets-vault";
import { SecretCrypto } from "../../shared/secrets/secret-crypto";
import { VariableFocus } from "../../services/variable-focus";
import { EnvironmentDoc, EnvironmentId } from "../../models/environments";
import { VariableToken } from "../../services/variable-focus";
import { describe, it, beforeEach, expect, vi } from "vitest";

function makeEnv(id: EnvironmentId, vars: Record<string, string> = {}): EnvironmentDoc {
  return {
    id,
    meta: { id, createdAt: 1, updatedAt: 1, version: 1 },
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
  readonly updateCalls: { id: EnvironmentId; updates: unknown }[] = [];
  readonly duplicateCalls: EnvironmentId[] = [];
  readonly deleteCalls: EnvironmentId[] = [];
  readonly setActiveCalls: (EnvironmentId | null)[] = [];

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
    id: EnvironmentId,
    updates: Partial<Pick<EnvironmentDoc, "name" | "description" | "vars">>
  ): Promise<EnvironmentDoc | null> {
    this.updateCalls.push({ id, updates });
    return null;
  }

  readonly changeCalls: { id: EnvironmentId; changes: unknown; details: unknown }[] = [];
  /** What the stored environment is after the change, as another tab may have left it. */
  changeResult: EnvironmentDoc | null = null;

  async changeEnvironment(id: EnvironmentId, changes: unknown, details: unknown): Promise<EnvironmentDoc | null> {
    this.changeCalls.push({ id, changes, details });
    // As the store does: it has read the environments again by the time a change returns.
    const result = this.changeResult;
    if (result) {
      this.environmentsState.update((envs) => envs.map((env) => (env.meta.id === id ? result : env)));
    }
    return result;
  }

  async duplicateEnvironment(id: EnvironmentId): Promise<EnvironmentDoc | null> {
    this.duplicateCalls.push(id);
    return null;
  }

  async deleteEnvironment(id: EnvironmentId): Promise<void> {
    this.deleteCalls.push(id);
  }

  async setActiveEnvironment(id: EnvironmentId | null): Promise<void> {
    this.setActiveCalls.push(id);
  }
}

class SecretsServiceStub {
  savedSecrets: { name: string; environmentId: string; plaintext: string }[] = [];
  private nextId = 1;

  async saveSecret(request: {
    name: string;
    environmentId: string;
    plaintext: string;
  }): Promise<string> {
    this.savedSecrets.push(request);
    return `secret-${this.nextId++}`;
  }

  async readSecret(secretId: string): Promise<string | null> {
    const match = this.savedSecrets.find((_, i) => `secret-${i + 1}` === secretId);
    return match?.plaintext ?? null;
  }
}

class SecretCryptoServiceStub {
  unlocked = true;
  get isUnlocked(): boolean {
    return this.unlocked;
  }
}

describe("EnvironmentsManager", () => {
  let component: EnvironmentsManager;
  let fixture: ComponentFixture<EnvironmentsManager>;
  let envService: EnvironmentsServiceStub;
  let secretsService: SecretsServiceStub;
  let secretCrypto: SecretCryptoServiceStub;
  let focusSubject: Subject<VariableToken>;

  beforeEach(async () => {
    envService = new EnvironmentsServiceStub();
    secretsService = new SecretsServiceStub();
    secretCrypto = new SecretCryptoServiceStub();
    focusSubject = new Subject<VariableToken>();

    await TestBed.configureTestingModule({
      imports: [EnvironmentsManager],
      providers: [
        { provide: EnvironmentsStore, useValue: envService },
        { provide: SecretsVault, useValue: secretsService },
        { provide: SecretCrypto, useValue: secretCrypto },
        { provide: VariableFocus, useValue: { focus$: focusSubject.asObservable(), requestFocus: () => {} } },
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

    it("save() sends a trimmed name and only what changed: an untouched variable is not written again", async () => {
      component.draft.update((d) => (d ? { ...d, name: "  Renamed  " } : d));
      component.addVariable();

      await component.save();

      // A is as it was loaded and the added row has no name: nothing to change.
      expect(envService.changeCalls).toEqual([{ id: "e1", changes: [], details: { name: "Renamed", description: "" } }]);
      expect(envService.updateCalls).toEqual([]);
    });

    it("save() sends a set for an edited or added variable and a removal for a deleted one, then shows what is stored", async () => {
      const draft = component.draft()!;
      draft.vars[0].value = "2";
      draft.vars.push({ key: " B ", value: "new", enabled: true });
      // Another tab saved C meanwhile; the stored document has it.
      envService.changeResult = makeEnv("e1", { A: "2", B: "new", C: "theirs" });

      await component.save();

      expect(envService.changeCalls[0].changes).toEqual([
        { key: "A", value: "2" },
        { key: "B", value: "new" },
      ]);
      expect(component.draft()?.vars.map((row) => row.key)).toEqual(["A", "B", "C"]);

      component.removeVariable(0);
      await component.save();
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

      await component.save();
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
      await component.save();

      // The switched-off row is not switched on by a save of something else.
      expect(envService.changeCalls[0].changes).toEqual([]);
      expect(component.draft()?.vars[0]).toEqual(rows[0]);
    });

    it("save() is a no-op when the draft's JSON is currently invalid", async () => {
      component.onJsonChange("{broken", false, undefined);

      await component.save();

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
      secretCrypto.unlocked = true;

      await component.protectVariable(0);

      expect(secretsService.savedSecrets).toEqual([
        { name: "TOKEN", environmentId: "e1", plaintext: "raw-value" },
      ]);
      expect(component.draft()?.vars[0].value).toMatch(/^\{\{\$secret\.secret-1\}\}$/);
    });

    it("protectVariable asks the caller to unlock instead of saving when the vault is locked", async () => {
      secretCrypto.unlocked = false;
      const unlockSpy = vi.fn();
      component.requestUnlock.subscribe(unlockSpy);

      await component.protectVariable(0);

      expect(secretsService.savedSecrets).toEqual([]);
      expect(unlockSpy).toHaveBeenCalled();
      expect(component.draft()?.vars[0].value).toBe("raw-value");
    });

    it("revealSecret fetches and caches the plaintext for a protected variable", async () => {
      secretCrypto.unlocked = true;
      await component.protectVariable(0);
      const placeholder = component.draft()!.vars[0].value;

      await component.revealSecret(0);

      expect(component.getSecretPreview(placeholder)).toBe("raw-value");
    });
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
