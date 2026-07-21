import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { Subject } from "rxjs";
import { EnvironmentsManagerComponent } from "./environments-manager.component";
import { EnvironmentsService } from "../../services/environments.service";
import { SecretsService } from "../../services/secrets.service";
import { SecretCryptoService } from "../../shared/secrets/secret-crypto.service";
import { VariableFocusService } from "../../services/variable-focus.service";
import { EnvironmentDoc, EnvironmentId } from "../../models/environments.models";
import { VariableToken } from "../../shared/environments/env-resolution.util";
import { describe, it, beforeEach, expect, vi } from "vitest";

function makeEnv(id: EnvironmentId, vars: Record<string, string> = {}): EnvironmentDoc {
  return {
    id,
    meta: { id, createdAt: 1, updatedAt: 1, version: 1 },
    name: `Env ${id}`,
    vars,
    order: 0,
  };
}

class EnvironmentsServiceStub {
  private readonly environmentsState = signal<EnvironmentDoc[]>([]);
  private readonly activeState = signal<EnvironmentDoc | null>(null);
  readonly environments = this.environmentsState.asReadonly();
  readonly activeEnvironment = this.activeState.asReadonly();
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

describe("EnvironmentsManagerComponent", () => {
  let component: EnvironmentsManagerComponent;
  let fixture: ComponentFixture<EnvironmentsManagerComponent>;
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
      imports: [EnvironmentsManagerComponent],
      providers: [
        { provide: EnvironmentsService, useValue: envService },
        { provide: SecretsService, useValue: secretsService },
        { provide: SecretCryptoService, useValue: secretCrypto },
        { provide: VariableFocusService, useValue: { focus$: focusSubject.asObservable(), requestFocus: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EnvironmentsManagerComponent);
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
        { key: "API_KEY", value: "abc" },
        { key: "BASE_URL", value: "https://example.com" },
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
      expect(component.draft()?.vars).toEqual([{ key: "", value: "" }]);
    });

    it("onJsonChange replaces the pairs from valid parsed JSON", () => {
      component.onJsonChange('{"X":"y"}', true, { X: "y" });

      expect(component.draft()?.vars).toEqual([{ key: "X", value: "y" }]);
    });

    it("onJsonChange leaves vars untouched when the JSON is invalid", () => {
      const before = component.draft()?.vars;
      component.onJsonChange("{not json", false, undefined);

      expect(component.draft()?.vars).toEqual(before!);
      expect(component.draft()?.jsonValid).toBe(false);
    });

    it("save() sends a trimmed name and a key/value record built from non-blank pairs", async () => {
      component.draft.update((d) => (d ? { ...d, name: "  Renamed  " } : d));
      component.addVariable();

      await component.save();

      expect(envService.updateCalls).toEqual([
        { id: "e1", updates: { name: "Renamed", description: undefined, vars: { A: "1" } } },
      ]);
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

    it("setActive() delegates to EnvironmentsService.setActiveEnvironment", async () => {
      const env = makeEnv("e1");

      await component.setActive(env);

      expect(envService.setActiveCalls).toEqual(["e1"]);
    });
  });
});
