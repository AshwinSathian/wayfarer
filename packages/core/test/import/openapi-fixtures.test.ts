import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { ImportError, importText, type Imported } from "../../src/import/import";
import { importTextOf } from "../../src/safe-json";

// P4.3: OpenAPI descriptions other people wrote, vendored at pinned commits
// (packages/core/test/fixtures/openapi/SOURCES.md). Each imports, and holds
// one request per operation: a count of the file's own paths and methods.

const ROOT = join(__dirname, "../fixtures/openapi");
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

/** The files of the set that hold no request to import, each with the start of what the app says. */
const REFUSED: Record<string, string> = {
  "oai/v3.1/webhook-example.yaml": "This OpenAPI file describes no operation under `paths`",
};
const descriptions = files.filter((file) => !Object.hasOwn(REFUSED, file));

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

/** The operations of a file, counted from the file itself and not by the importer: each method of each path. */
function operations(file: string): number {
  const value = parse(read(file)) as Loose;
  const paths = isObject(value["paths"]) ? value["paths"] : {};
  return Object.values(paths).reduce<number>(
    (sum, item) => sum + (isObject(item) ? METHODS.filter((method) => isObject(item[method])).length : 0),
    0,
  );
}

/** The three files the plan names: the Petstore as Swagger 2.0, OpenAPI 3.0 and OpenAPI 3.1. */
const PETSTORES: [string, string, number][] = [
  ["swagger-codegen/petstore-2.0.json", "2.0", 20],
  ["swagger-petstore/petstore-3.0.yaml", "3.0.4", 19],
  ["swagger-petstore/petstore-3.1.yaml", "3.1.1", 6],
];

describe("OpenAPI descriptions other people wrote (P4.3)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("the set is here, with its licences: 13 files, 12 of them with operations", () => {
    for (const source of ["oai", "swagger-codegen", "swagger-petstore"])
      expect(statSync(join(ROOT, source, "LICENSE")).size).toBeGreaterThan(1000);
    expect(files).toHaveLength(13);
    expect(descriptions).toHaveLength(12);
  });

  it.each(PETSTORES)(
    "@claim:C-060 the Petstore of %s (version %s) imports as %i requests, one per operation",
    (file, version, count) => {
      const value = parse(read(file)) as Loose;
      expect(value["swagger"] ?? value["openapi"]).toBe(version);
      expect(operations(file)).toBe(count);
      const imported = importText(read(file));
      expect(imported.report.formatName).toBe("OpenAPI description");
      expect(imported.report.counts).toMatchObject({ collections: 1, requests: count, environments: 0 });
      expect(imported.collections[0].payload.requests).toHaveLength(count);
    },
  );

  it.each(descriptions)("%s imports, with a request for each operation of the file", (file) => {
    let imported: Imported;
    try {
      imported = importText(read(file));
    } catch (error) {
      throw new Error(
        `${file}: ${error instanceof ImportError ? `${error.message} ${JSON.stringify(error.issues.slice(0, 3))}` : String(error)}`,
        { cause: error },
      );
    }
    expect(imported.report.formatName).toBe("OpenAPI description");
    expect(imported.report.counts.requests).toBe(operations(file));
    // Every request goes to the server the file names, through the collection's variable.
    const { collection, requests } = imported.collections[0].payload;
    expect(collection.variables.map((row) => row.key)).toContain("baseUrl");
    for (const request of requests) expect(request.scripts).toEqual({ pre: "", post: "" });
  });

  it("@claim:C-001 nothing is fetched for any file of the set", () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    for (const file of files) {
      try {
        importText(read(file));
      } catch (error) {
        expect(error).toBeInstanceOf(ImportError);
      }
    }
    expect(fetched).not.toHaveBeenCalled();
  });

  it("the whole set: what is imported, and the kinds of warning", () => {
    const total = { collections: 0, folders: 0, requests: 0, environments: 0 };
    const kinds = new Map<string, number>();
    for (const file of descriptions) {
      const { report } = importText(read(file));
      for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += report.counts[key];
      // A warning's kind is its words without the names it quotes.
      for (const { message } of report.warnings) {
        const kind = message
          .replace(/\([^)]*\)/g, "(…)")
          .replace(/"[^"]*"/g, '"…"')
          .replace(/\d+/g, "N");
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
