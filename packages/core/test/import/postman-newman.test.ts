import variant from "@jitl/quickjs-wasmfile-release-sync";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importText } from "../../src/import/import";
import { importTextOf } from "../../src/safe-json";
// @ts-expect-error -- a JavaScript module of the e2e support, without types. The same server Newman ran against, and the same change of addresses.
import { rewritePostmanFile, startEchoServer } from "../../../../e2e/support/echo-server.mjs";
import golden from "../fixtures/postman/newman-integration.golden.json";
import { runCollection, type RunResult } from "../pm-compat/run-collection";

// P4.2: Newman's own integration collections, imported, give in the app's
// engine the test names and results Newman gives for the files themselves.
// Newman's are in the golden file, written by `npm run golden`.
//
// A collection is compared when Newman could run it here (the golden file
// says why not, for each that it could not) and the import report has no
// warning that changes what is run or sent: a part of Postman's script API
// the app does not have, or an auth type it does not have.

const ROOT = join(__dirname, "../fixtures/postman/newman/integration");
type Golden = { items: RunResult[]; errors: string[] } | { notRun: string };
const entries = Object.entries(golden.collections as unknown as Record<string, Golden>);
const read = (path: string): unknown => JSON.parse(importTextOf(readFileSync(path)));

/** Why an import cannot be held to Newman's results, from its report: what the app does not have. */
const OUTSIDE = [/, which Wayfarer does not have\./, /Its auth is of a type the app does not have/, /is left out\.$/];
/** The legacy library globals the report's scan does not look for (a script that requires lodash or crypto-js gives them those names). */
const LEGACY_GLOBAL = /(?<![\w$.])(?:_\.|CryptoJS\b)/;
/** Outside the matrix for a reason that neither the report nor the scripts' text gives. */
const OUTSIDE_BY_DESIGN: Record<string, string> = {
  "request-name-in-script.postman_collection.json":
    "its scripts read `request.name` and `request.description` of the legacy `request` (matrix: partial), and its pre-request script then ends in an error: Postman sends anyway, the app stops the send (P3.9)",
};

/**
 * Where the app does not do what Newman does, though no row of the matrix
 * says so: findings of this comparison, each with its issue. The test holds
 * that each still differs, so a fix removes its line here.
 */
const GAPS: Record<string, string> = {
  "bom-and-encoding/bom-in-environment-file.postman_collection.json": "F74 (#248): a variable whose name holds a slash (`{{fo/o}}`) is not replaced",
  "slashed-variable-names/slashed-variable-names.postman_collection.json": "F74 (#248): a variable whose name holds a slash or a backslash is not replaced",
  "clear-vars-sandbox.postman_collection.json": "F75 (#248): the legacy `environment` and `globals` objects do not show a value the same script has just set",
  "multi-level-folders-v2.postman_collection.json": "F76 (#248): a variable a script set to the number 0 reads back as the text \"0\" in the same run",
  "redirect-test/redirect-test.postman_collection.json": "F77 (#248): a script with `return` outside a function ends in an error; Postman runs a script as a function's body",
  "prototype-check.postman_collection.json": "F78 (#248): the older sandbox's additions to `Array.prototype` and the like (`[].none`, `(56).hex`) are not there, and the matrix has no row for them",
  "cookie-jar.postman_collection.json": "F78 (#248): `postman.getResponseCookie` is not there, and the matrix has no row for it",
};

describe("Newman's integration collections, imported, against Newman", () => {
  let quickjs: QuickJSWASMModule;
  let server: { address(): { port: number }; close(): void };
  beforeAll(async () => {
    quickjs = await newQuickJSWASMModuleFromVariant(variant);
    server = (await startEchoServer(0, "127.0.0.1", { postmanEcho: true })) as typeof server;
  });
  afterAll(() => server.close());

  const load = (name: string) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const file = join(ROOT, name);
    const imported = importText(JSON.stringify(rewritePostmanFile(read(file), base)));
    const beside = (kind: string) => {
      const path = file.replace(/\.postman_collection\.json$/, `.postman_${kind}.json`);
      return existsSync(path) ? importText(JSON.stringify(rewritePostmanFile(read(path), base))).environments[0].vars : [];
    };
    return { imported, environment: beside("environment"), globals: beside("globals") };
  };

  /** What stands between a collection and the comparison, or null: read from the golden file, the import report and the scripts. */
  const outside = (name: string, entry: Golden): string | null => {
    if ("notRun" in entry) return `Newman did not run it here: ${entry.notRun}`;
    if (Object.hasOwn(OUTSIDE_BY_DESIGN, name)) return OUTSIDE_BY_DESIGN[name];
    const { imported } = load(name);
    const warning = imported.report.warnings.find(({ message }) => OUTSIDE.some((pattern) => pattern.test(message)));
    if (warning) return `${warning.item}: ${warning.message}`;
    const { collection, folders, requests } = imported.collections[0].payload;
    const legacy = [collection, ...folders, ...requests].flatMap((holder) => [holder.scripts.pre, holder.scripts.post]).map((script) => LEGACY_GLOBAL.exec(script)?.[0]).find(Boolean);
    return legacy ? `a script uses the legacy global ${legacy.replace(".", "")} (matrix: legacy library globals, unsupported)` : null;
  };
  /** The harness's results beside Newman's. Newman names a request that has no name by nothing at all. */
  const compare = async (name: string, entry: Golden): Promise<{ ours: unknown; newman: unknown }> => {
    if ("notRun" in entry) throw new Error("not run");
    const { imported, environment, globals } = load(name);
    const results = await runCollection(quickjs, imported.collections[0].payload, { environment, globals });
    return { ours: results.map((item, index) => ({ ...item, name: entry.items[index]?.name === undefined ? undefined : item.name })), newman: entry.items.map((item) => ({ ...item, name: item.name })) };
  };

  it("the golden file was written by Newman, and has every collection of the set: run, or not run and why", () => {
    expect(golden.runner).toMatch(/^newman@\d+\.\d+\.\d+$/);
    expect(entries).toHaveLength(45);
    expect(entries.filter(([, entry]) => "items" in entry)).toHaveLength(30);
    for (const [, entry] of entries) if ("notRun" in entry) expect(entry.notRun.length).toBeGreaterThan(10);
  });

  it("@claim:C-058 every collection inside the matrix gives Newman's test names, passes and failures", async () => {
    const compared: string[] = [];
    const left: Record<string, string> = {};
    for (const [name, entry] of entries) {
      const reason = outside(name, entry) ?? (Object.hasOwn(GAPS, name) ? GAPS[name] : null);
      if (reason) {
        left[name] = reason;
        continue;
      }
      const { ours, newman } = await compare(name, entry);
      expect(ours, name).toEqual(newman);
      // Newman met no script error in any of these: neither did the harness, which throws on one.
      expect((entry as { errors: string[] }).errors, name).toEqual([]);
      compared.push(name);
    }

    // The count is in the plan's Appendix A. A collection that leaves this list needs a reason in `left`.
    expect(compared).toEqual([
      "bom-and-encoding/bom-in-collection-file.postman_collection.json",
      "bom-and-encoding/utf16-le-encoding-in-env.postman_collection.json",
      "case-insen-header-sandbox.postman_collection.json",
      "disabled-and-duplicate-variables/disabled-and-duplicates.postman_collection.json",
      "distinct-random-int.postman_collection.json",
      "esc-formdata/esc-formdata.postman_collection.json",
      "multiple-form-values.postman_collection.json",
      "newman-gzip-test.postman_collection.json",
      "request-chaining-test.postman_collection.json",
      "semicolon-tests.postman_collection.json",
      "timeout/timeout.postman_collection.json",
      "var-replacement.postman_collection.json",
    ]);
    expect(Object.keys(left)).toHaveLength(45 - compared.length);
    expect(left).toMatchSnapshot();
  }, 120_000);

  it.each(Object.entries(GAPS))("a known gap still differs from Newman: %s (%s)", async (name) => {
    const entry = entries.find(([file]) => file === name)?.[1];
    expect(entry && "items" in entry).toBe(true);
    // No other reason stands in front of it: the gap is what keeps it out.
    expect(outside(name, entry as Golden)).toBeNull();
    const result = await compare(name, entry as Golden).then(
      ({ ours, newman }) => (JSON.stringify(ours) === JSON.stringify(newman) ? "the same" : "differs"),
      () => "a script ended in an error"
    );
    expect(result).not.toBe("the same");
  });
});
