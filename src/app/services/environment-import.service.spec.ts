import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnvironmentDoc } from "../models/environments.models";
import { EnvironmentImportService } from "./environment-import.service";
import { EnvironmentsService } from "./environments.service";

const env = (id: string, name: string, order: number, vars: Record<string, string> = {}): EnvironmentDoc => ({
  id,
  meta: { id, createdAt: 1, updatedAt: 1, version: 1 },
  name,
  order,
  vars,
});

describe("EnvironmentImportService", () => {
  let service: EnvironmentImportService;
  const envService = { updateEnvironment: vi.fn(), createEnvironment: vi.fn() };
  const existing = [env("dev-1", "Dev", 1), env("stage-1", "Staging", 2)];
  const file = JSON.stringify([env("x", "Dev", 1, { host: "new" }), env("y", "QA", 2, { host: "qa" })]);

  beforeEach(() => {
    envService.updateEnvironment.mockReset();
    envService.createEnvironment.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: EnvironmentsService, useValue: envService }] });
    service = TestBed.inject(EnvironmentImportService);
  });

  it("stages a file: an environment with an existing name replaces it, a new name is added", () => {
    service.stageFile("envs.json", file, existing);

    expect(service.dialogVisible()).toBe(true);
    expect(service.fileName()).toBe("envs.json");
    expect(service.errors()).toEqual([]);
    expect(service.pendingEntries().map((e) => [e.doc.name, e.action, e.targetId])).toEqual([
      ["Dev", "replace", "dev-1"],
      ["QA", "merge", null],
    ]);
  });

  it("shows the validation errors of a bad file and imports nothing on confirm", async () => {
    service.stageFile("bad.json", "{nope", existing);
    expect(service.errors()).toEqual(["File does not contain a valid JSON payload."]);
    expect(service.pendingEntries()).toEqual([]);

    await service.confirm(existing);

    expect(envService.updateEnvironment).not.toHaveBeenCalled();
    expect(envService.createEnvironment).not.toHaveBeenCalled();
    expect(service.dialogVisible()).toBe(false);
    expect(service.errors()).toEqual([]);
  });

  it("lets the user switch a match to 'add', but never to 'replace' when nothing matches", () => {
    service.stageFile("envs.json", file, existing);

    service.setEntryAction(0, "merge");
    service.setEntryAction(1, "replace"); // QA matches nothing: stays "merge"
    service.setEntryAction(7, "merge"); // out of range: ignored

    expect(service.pendingEntries().map((e) => e.action)).toEqual(["merge", "merge"]);
  });

  it("confirm replaces matches in place and adds the rest under a name that is not taken", async () => {
    service.stageFile("envs.json", file, [...existing, env("qa-1", "QA", 3), env("qa-2", "QA (2)", 4)]);
    service.setEntryAction(1, "merge"); // add the file's QA beside the existing ones

    await service.confirm([...existing, env("qa-1", "QA", 3), env("qa-2", "QA (2)", 4)]);

    expect(envService.updateEnvironment).toHaveBeenCalledExactlyOnceWith("dev-1", { name: "Dev", description: undefined, vars: { host: "new" } });
    expect(envService.createEnvironment).toHaveBeenCalledExactlyOnceWith({ name: "QA (3)", description: undefined, vars: { host: "qa" } });
    expect(service.dialogVisible()).toBe(false);
    expect(service.pendingEntries()).toEqual([]);
    expect(service.fileName()).toBe("");
  });
});
