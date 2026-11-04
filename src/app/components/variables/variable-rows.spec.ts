import { ComponentFixture, TestBed } from "@angular/core/testing";
import type { Row, VariableChange } from "@wayfarer/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rowsOf } from "../../../testing/request-fixtures";
import { SecretsVault } from "../../services/secrets-vault";
import { VariableRows, type VariableHolder } from "./variable-rows";

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
  savedSecrets: { name: string; environmentId?: string; plaintext: string }[] = [];
  private nextId = 1;

  async saveSecret(request: { name: string; environmentId?: string; plaintext: string }): Promise<string> {
    this.savedSecrets.push(request);
    return `secret-${this.nextId++}`;
  }

  async readSecret(secretId: string): Promise<string | null> {
    const match = this.savedSecrets.find((_, i) => `secret-${i + 1}` === secretId);
    return match?.plaintext ?? null;
  }
}

/** A set of variables as a store holds them: each write is recorded, and gives back `after` (the rows stored then). */
class Store {
  calls: VariableChange[][] = [];
  /** The rows stored after a write: another tab's may be in them. Null: the set was deleted. */
  after: Row[] | null = [];
  write = async (changes: VariableChange[]): Promise<readonly Row[] | null> => {
    this.calls.push(changes);
    return this.after;
  };
  /** An environment's variables, or with `environment` false a collection's. */
  holder(rows: Row[], id = "e1", environment = true): VariableHolder {
    return {
      id,
      name: `Env ${id}`,
      rows,
      ...(environment && { environmentId: id }),
      write: (changes) => this.write(changes),
    };
  }
}

describe("VariableRows", () => {
  let component: VariableRows;
  let fixture: ComponentFixture<VariableRows>;
  let secretsService: SecretsServiceStub;
  let store: Store;

  const show = async (holder: VariableHolder) => {
    fixture.componentRef.setInput("holder", holder);
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    secretsService = new SecretsServiceStub();
    store = new Store();
    await TestBed.configureTestingModule({
      imports: [VariableRows],
      providers: [{ provide: SecretsVault, useValue: secretsService }],
    }).compileComponents();
    fixture = TestBed.createComponent(VariableRows);
    component = fixture.componentInstance;
  });

  it("builds a draft (pairs + pretty JSON) from the holder's rows", async () => {
    await show(store.holder(rowsOf({ API_KEY: "abc", BASE_URL: "https://example.com" })));
    const draft = component.draft();
    expect(draft?.vars).toEqual([
      { key: "API_KEY", value: "abc", enabled: true },
      { key: "BASE_URL", value: "https://example.com", enabled: true },
    ]);
    expect(draft?.jsonValid).toBe(true);
    expect(JSON.parse(draft!.jsonText)).toEqual({ API_KEY: "abc", BASE_URL: "https://example.com" });
  });

  describe("editing variables", () => {
    beforeEach(async () => {
      store.after = rowsOf({ A: "1" });
      await show(store.holder(rowsOf({ A: "1" })));
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

    it("commit() writes nothing when nothing changed: an untouched variable is not written again", async () => {
      component.addVariable();
      await component.commit();
      expect(store.calls).toEqual([]);
    });

    it("commit() sends a set for an edited or added variable and a removal for a deleted one, then shows what is stored", async () => {
      const draft = component.draft()!;
      draft.vars[0].value = "2";
      draft.vars.push({ key: " B ", value: "new", enabled: true });
      // Another tab saved C meanwhile; the stored rows have it.
      store.after = rowsOf({ A: "2", B: "new", C: "theirs" });

      await component.commit();

      expect(store.calls[0]).toEqual([
        { key: "A", value: "2" },
        { key: "B", value: "new" },
      ]);
      expect(component.draft()?.vars.map((row) => row.key.trim())).toEqual(["A", "B", "C"]);

      component.removeVariable(0);
      await component.commit();
      expect(store.calls[1]).toEqual([{ key: "A", value: null }]);
    });

    it("shows a change made elsewhere, but not over edits that are not saved yet", async () => {
      await show(store.holder(rowsOf({ A: "1", fromElsewhere: "x" })));
      expect(component.draft()?.vars.map((row) => row.key)).toEqual(["A", "fromElsewhere"]);

      component.draft()!.vars[0].value = "mine";
      await show(store.holder(rowsOf({ A: "theirs", fromElsewhere: "x" })));
      expect(component.draft()?.vars[0].value).toBe("mine");
    });

    it("keeps a new row that has no name yet while another row is edited (F59)", async () => {
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

    it("commit() writes nothing while the JSON is not JSON", async () => {
      component.draft()!.vars[0].value = "2";
      component.onJsonChange("{broken", false, undefined);
      await component.commit();
      expect(store.calls).toEqual([]);
    });

    it("writes what was typed when the rows close", async () => {
      component.draft()!.vars[0].value = "typed";
      fixture.destroy();
      await vi.waitFor(() => expect(store.calls).toHaveLength(1));
      expect(store.calls[0]).toEqual([{ key: "A", value: "typed" }]);
    });

    it("writes the set being left when another is shown", async () => {
      const first = store.calls;
      component.draft()!.vars[0].value = "typed";
      await show(store.holder(rowsOf({ B: "2" }), "e2"));
      await vi.waitFor(() => expect(first).toHaveLength(1));
      expect(first[0]).toEqual([{ key: "A", value: "typed" }]);
      expect(component.draft()?.holder.id).toBe("e2");
    });

    it("says so under the rows when the browser refuses the write, and keeps the edit", async () => {
      store.write = async () => {
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

    it("says when the set was deleted in another tab", async () => {
      store.after = null;
      component.draft()!.vars[0].value = "typed";
      await component.commit();
      expect(component.saveError()).toBe("Env e1 was not saved: it was deleted in another tab.");
    });

    it("keeps what was typed while a write was on its way", async () => {
      component.draft()!.vars[0].value = "first";
      store.write = async (changes) => {
        store.calls.push(changes);
        // Typed into the next field while the write is on its way.
        component.draft()!.vars[0].value = "second";
        return rowsOf({ A: "first" });
      };
      await component.commit();
      expect(component.draft()?.vars[0].value).toBe("second");
    });

    it("shows a variable a chip asked for, and makes its row when there is none (U-132)", async () => {
      fixture.componentRef.setInput("reveal", { key: "A" });
      fixture.detectChanges();
      expect(component.focusedVariableKey()).toBe("A");
      expect(component.draft()?.vars).toHaveLength(1);

      fixture.componentRef.setInput("reveal", { key: "missing" });
      fixture.detectChanges();
      expect(component.draft()?.vars.map((row) => row.key)).toEqual(["A", "missing"]);
    });
  });

  it("opening a set keeps a switched-off variable and a name that is there twice (F59)", async () => {
    const rows = [
      { key: "off", value: "1", enabled: false },
      { key: "twice", value: "first", enabled: true },
      { key: "twice", value: "second", enabled: true },
    ];
    await show(store.holder(rows));
    expect(component.draft()?.vars).toEqual(rows);

    component.draft()!.vars[1].value = "edited";
    component.onPairsChange();
    fixture.detectChanges();
    await fixture.whenStable();
    await component.commit();

    // Nothing the store would see changed, so nothing is written, and the switched-off row stays off.
    expect(store.calls).toEqual([]);
    expect(component.draft()?.vars[0]).toEqual(rows[0]);
  });

  it("a row with a value and no name, or a name and no value, says so", () => {
    expect(component.rowNote({ key: "", value: "x", enabled: true })).toBe(
      "This row has no name, so it is not kept. Give it one.",
    );
    expect(component.rowNote({ key: "k", value: "", enabled: true })).toBe("This variable is empty.");
    expect(component.rowNote({ key: "", value: "", enabled: true })).toBeNull();
  });

  describe("secret-protected variables", () => {
    beforeEach(async () => {
      store.after = rowsOf({ TOKEN: "{{$secret.secret-1}}" });
      await show(store.holder(rowsOf({ TOKEN: "raw-value" })));
    });

    it("isSecretValue/getSecretPreview recognize the {{$secret.<id>}} placeholder format", () => {
      expect(component.isSecretValue("{{$secret.abc-123}}")).toBe(true);
      expect(component.isSecretValue("plain text")).toBe(false);
      expect(component.isSecretValue(undefined)).toBe(false);
    });

    it("protectVariable replaces the plaintext value with a {{$secret.<id>}} placeholder when unlocked", async () => {
      await component.protectVariable(0);

      expect(secretsService.savedSecrets).toEqual([{ name: "TOKEN", environmentId: "e1", plaintext: "raw-value" }]);
      expect(component.draft()?.vars[0].value).toMatch(/^\{\{\$secret\.secret-1\}\}$/);
    });

    it("a collection's or a folder's variable is marked with no environment, and only its reference is written (L-1)", async () => {
      await show(store.holder(rowsOf({ token: "abc-plain" }), "collection-1", false));
      await component.protectVariable(0);

      expect(secretsService.savedSecrets).toEqual([
        { name: "token", environmentId: undefined, plaintext: "abc-plain" },
      ]);
      expect(store.calls).toEqual([[{ key: "token", value: "{{$secret.secret-1}}" }]]);
      expect(JSON.stringify(store.calls)).not.toContain("abc-plain");
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
      expect(store.calls.at(-1)).toEqual([{ key: "TOKEN", value: "{{$secret.secret-1}}" }]);
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
      expect(store.calls.at(-1)).toEqual([{ key: "TOKEN", value: "{{$secret.secret-1}}" }]);
    });

    it("a row whose lock is pressed is not written as plain text on the way to the vault", async () => {
      secretsService.unlocked = false;
      secretsService.vault = false;
      store.after = rowsOf({ TOKEN: "raw-value", NEW: "plain" });
      component.draft()!.vars.push({ key: "NEW", value: "plain", enabled: true });
      // The press comes before the field's blur.
      component.holdForSecret(1);
      component.onFocusOut(new FocusEvent("focusout"));
      await component.protectVariable(1);
      component.onFocusOut(new FocusEvent("focusout"));
      await component.commit();
      expect(JSON.stringify(store.calls)).not.toContain("plain");
      component.cancelVaultForRow();
      await component.commit();
      expect(JSON.stringify(store.calls)).toContain("plain");
    });

    it("a row with no name says why it cannot be marked", async () => {
      component.draft()!.vars.push({ key: "", value: "v", enabled: true });
      await component.protectVariable(1);
      expect(component.protectProblem()).toEqual({
        index: 1,
        text: "A variable needs a name and a value to be kept as a secret.",
      });
    });

    // C-053's stall in WebKit (e2e/FLAKES.md): a second click on "Mark this variable as secret" changed nothing for 15 s,
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
      await component.protectVariable(0);
      const placeholder = component.draft()!.vars[0].value;
      await component.revealSecret(0);
      expect(component.getSecretPreview(placeholder)).toBe("raw-value");
    });
  });
});
