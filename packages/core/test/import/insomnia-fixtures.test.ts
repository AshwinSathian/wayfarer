import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ImportError, importText, type Imported } from "../../src/import/import";
import { importTextOf } from "../../src/safe-json";

// P4.4: Insomnia files that Insomnia's own repository holds as fixtures,
// vendored at a pinned commit (packages/core/test/fixtures/insomnia/SOURCES.md).
// Every export among them imports, and holds the requests, folders and
// environments that a count of the file itself gives.

const ROOT = join(__dirname, "../fixtures/insomnia");
const files: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(json|ya?ml)$/.test(name)) files.push(path.slice(ROOT.length + 1));
  }
};
walk(ROOT);

const read = (file: string): string => importTextOf(readFileSync(join(ROOT, file)));

/** The files of the set that are not an export the app reads, each with the start of what the app says. */
const REFUSED: Record<string, string> = {
  "inso/insomnia-v4/empty.yaml": "The file is neither JSON nor YAML",
  // A key that is there twice: read as JSON reads it, the last one kept, and then no format the app knows.
  "inso/insomnia-v4/malformed.yaml": "This is not a file Wayfarer can import",
  "inso/insomnia-v4/no-export-format.yaml": "This is not a file Wayfarer can import",
  "inso/insomnia-v4/v3-export-format.yaml": "This is an Insomnia export of format 3",
  // An OpenAPI description, which P4.3 reads.
  "roundtrip/security.yaml": "This is not a file Wayfarer can import",
  "smoke/mock-server.yaml": "This Insomnia file (mock.insomnia.rest/5.0) holds no requests and no environments",
};
const exports = files.filter((file) => !Object.hasOwn(REFUSED, file));

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown): Loose[] => (Array.isArray(value) ? value.filter(isObject) : []);
/** A request the app can hold: it has an address. */
const sendable = (entry: Loose): boolean => typeof entry["url"] === "string" && entry["url"].trim() !== "";

/** What a file holds, counted from the file itself and not by the importer. */
function counted(file: string): { collections: number; folders: number; requests: number; environments: number } {
  const value = parse(read(file)) as Loose;
  if (value["_type"] === "export") {
    const resources = list(value["resources"]);
    const of = (type: string) => resources.filter((entry) => entry["_type"] === type);
    const ids = new Set(of("environment").map((entry) => entry["_id"]));
    return {
      collections: of("workspace").length,
      folders: of("request_group").length,
      requests: of("request").filter(sendable).length,
      environments: of("environment").filter((entry) => ids.has(entry["parentId"])).length,
    };
  }
  let folders = 0;
  let requests = 0;
  const level = (items: unknown): void => {
    for (const entry of list(items)) {
      if (Array.isArray(entry["children"])) {
        folders++;
        level(entry["children"]);
      } else if (typeof entry["method"] === "string" && sendable(entry)) requests++;
    }
  };
  level(value["collection"]);
  const environments = isObject(value["environments"]) ? value["environments"] : {};
  const subs = list(environments["subEnvironments"]).length;
  // A file of environments alone gives its base environment too: there is no collection to hold its variables.
  return Array.isArray(value["collection"]) ? { collections: 1, folders, requests, environments: subs } : { collections: 0, folders: 0, requests: 0, environments: subs + 1 };
}

describe("Insomnia files other people wrote (P4.4)", () => {
  it("the set is here, with its licence: 64 files, 58 of them exports the app reads", () => {
    expect(statSync(join(ROOT, "LICENSE")).size).toBeGreaterThan(1000);
    expect(files).toHaveLength(64);
    expect(exports).toHaveLength(58);
    const versions = exports.map((file) => ((parse(read(file)) as Loose)["_type"] === "export" ? 4 : 5));
    expect([versions.filter((version) => version === 4).length, versions.filter((version) => version === 5).length]).toEqual([6, 52]);
  });

  it.each(exports)("@claim:C-059 %s imports, with the counts the file itself gives", (file) => {
    let imported: Imported;
    try {
      imported = importText(read(file));
    } catch (error) {
      throw new Error(`${file}: ${error instanceof ImportError ? `${error.message} ${JSON.stringify(error.issues.slice(0, 3))}` : String(error)}`);
    }
    expect(imported.report.formatName).toBe("Insomnia export");
    expect(imported.report.counts).toEqual(counted(file));
  });

  it("the whole set: what is imported, and the kinds of warning", () => {
    const total = { collections: 0, folders: 0, requests: 0, environments: 0 };
    const kinds = new Map<string, number>();
    for (const file of exports) {
      const { report } = importText(read(file));
      for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += report.counts[key];
      // A warning's kind is its words without the names it quotes.
      for (const { message } of report.warnings) {
        const kind = message.replace(/\([^)]*\)/g, "(…)").replace(/"[^"]*"/g, '"…"').replace(/\d+/g, "N");
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      }
    }
    expect(total).toMatchSnapshot();
    expect(Object.fromEntries([...kinds].sort(([a], [b]) => a.localeCompare(b)))).toMatchSnapshot();
  });

  it.each(Object.entries(REFUSED))("%s is refused, and says why", (file, message) => {
    expect(() => importText(read(file))).toThrow(ImportError);
    expect(() => importText(read(file))).toThrow(message);
  });
});
