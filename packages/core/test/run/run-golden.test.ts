import variant from "@jitl/quickjs-wasmfile-release-sync";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importText } from "../../src/import/import";
import { parseDataFile } from "../../src/run/data-file";
import { junitXml, runReportJson } from "../../src/run/report";
import type { RunOptions, RunReport } from "../../src/run/runner";
// @ts-expect-error -- a JavaScript module of the e2e support, without types. The same server Newman ran against.
import { startEchoServer } from "../../../../e2e/support/echo-server.mjs";
import dataGolden from "../fixtures/run/data.golden.json";
import flowGolden from "../fixtures/run/flow.golden.json";
import orderGolden from "../fixtures/run/order.golden.json";
import { runCollectionReport } from "../pm-compat/run-collection";

// P5.2: a collection run. `runRequests` is the order of a run; here it is
// given a sender made of the engine's own pieces, against the echo server,
// and held to what Newman, Postman's runner, did with the same files
// (`npm run golden` wrote the golden files).

const FIXTURES = join(__dirname, "../fixtures");
const INFO = { name: "Run with a data file", startedAt: "2026-10-12T00:00:00.000Z" };

/** `xmllint --schema`: what it wrote, and its exit code. */
function validate(xml: string, schema: string): Promise<{ code: number; output: string }> {
  return new Promise((done, failed) => {
    void (async () => {
      const folder = await mkdtemp(join(tmpdir(), "wayfarer-junit-"));
      const file = join(folder, "report.xml");
      await writeFile(file, xml);
      execFile("xmllint", ["--noout", "--schema", schema, file], (error, _stdout, stderr) => {
        void rm(folder, { recursive: true, force: true });
        // No binary is not "the report is not valid": the test must not pass or fail for that reason.
        if (error && typeof error.code !== "number")
          failed(
            new Error(`xmllint did not run (${error.message}). On Debian and Ubuntu it is the package libxml2-utils.`),
          );
        else done({ code: error ? Number(error.code) : 0, output: stderr });
      });
    })();
  });
}

describe("a collection run, against Newman", () => {
  let quickjs: QuickJSWASMModule;
  let server: { address(): { port: number }; close(): void };
  beforeAll(async () => {
    quickjs = await newQuickJSWASMModuleFromVariant(variant);
    server = (await startEchoServer(0)) as typeof server;
  });
  afterAll(() => server.close());

  const run = (file: string, options: RunOptions): Promise<RunReport> => {
    const [{ payload: source }] = importText(readFileSync(join(FIXTURES, "run", file), "utf8")).collections;
    return runCollectionReport(
      quickjs,
      source,
      {
        environment: [{ key: "base", value: `http://127.0.0.1:${server.address().port}`, enabled: true }],
        tolerant: true,
      },
      options,
    );
  };
  /** A report as a golden file holds a run: Newman lists no request that was skipped. */
  const asNewman = (report: RunReport) =>
    report.results
      .filter((result) => !result.skipped)
      .map((result) => ({
        iteration: result.iteration,
        name: result.name,
        tests: result.tests.map(({ name, passed }) => ({ name, passed })),
      }));
  /** Without what differs from one run to the next: an imported request's id, the server's port. */
  const stable = (report: RunReport) =>
    JSON.parse(
      JSON.stringify({ ...report, results: report.results.map(({ id: _id, ...result }) => result) }).replaceAll(
        String(server.address().port),
        "PORT",
      ),
    ) as unknown;

  it("three requests and a data file of five rows give fifteen results, the ones Newman gives", async () => {
    const data = parseDataFile(readFileSync(join(FIXTURES, "run/data.csv"), "utf8"), "data.csv");
    expect(data).toHaveLength(5);

    const report = await run("data.postman_collection.json", { data });

    expect(report.ended).toBe("completed");
    expect(report.iterations).toBe(5);
    expect(report.results).toHaveLength(15);
    expect(asNewman(report)).toEqual(dataGolden.items);
    // Not a list of passes only: two tests fail on purpose, here and in Newman.
    expect(report.results.flatMap((result) => result.tests).filter((test) => !test.passed)).toHaveLength(2);
    expect(stable(report)).toMatchSnapshot();
  });

  it("the JUnit report of that run is valid against the JUnit schema, and so is one of awkward names", async () => {
    const schema = join(FIXTURES, "junit/junit-10.xsd");
    const data = parseDataFile(readFileSync(join(FIXTURES, "run/data.csv"), "utf8"), "data.csv");
    const report = await run("data.postman_collection.json", { data });
    const xml = junitXml(report, INFO);

    expect(await validate(xml, schema)).toEqual({ code: 0, output: expect.stringMatching(/validates\n$/) });
    expect(xml).toContain('<testsuites name="Run with a data file" tests="40" failures="2" errors="0"');
    expect(xml.match(/<testsuite /g)).toHaveLength(15);

    const awkward: RunReport = {
      iterations: 1,
      ended: "completed",
      results: [
        {
          id: 'a"<b>&',
          name: 'x < y & "z"\n\u0000\uD800 \u{1F600}',
          iteration: 0,
          tests: [{ name: "]]> <failure>", passed: false, error: "expected 'a' & got \u0007" }],
          durationMs: 1234567,
        },
        { id: "b", name: "no response", iteration: 0, tests: [], error: "Network error" },
        { id: "c", name: "skipped", iteration: 0, tests: [], skipped: true },
        { id: "d", name: "nothing to say", iteration: 0, tests: [], status: 204 },
      ],
    };
    expect(await validate(junitXml(awkward, { ...INFO, name: 'a "run" <of> &' }), schema)).toEqual({
      code: 0,
      output: expect.stringMatching(/validates\n$/),
    });
    // The validator does refuse what is not a report: this test would see it.
    expect((await validate(`<testsuites><testsuite name="no counts"/></testsuites>`, schema)).code).not.toBe(0);
  });

  it("the JSON report holds the results and their totals", async () => {
    const data = parseDataFile(readFileSync(join(FIXTURES, "run/data.csv"), "utf8"), "data.csv");
    const report = await run("data.postman_collection.json", { data });
    expect(runReportJson(report, INFO)).toMatchObject({
      $id: "wayfarer/run",
      name: INFO.name,
      startedAt: INFO.startedAt,
      iterations: 5,
      ended: "completed",
      totals: { requests: 15, skipped: 0, tests: 40, failedTests: 2, errors: 0 },
    });
  });

  it("setNextRequest, skipRequest and null move a run as they move Newman's", async () => {
    const report = await run("flow.postman_collection.json", { iterations: 3 });

    expect(asNewman(report)).toEqual(flowGolden.items);
    expect(report.ended).toBe("completed");
    // The skipped request is in the results, as skipped, in the two iterations that reach it.
    expect(report.results.filter((result) => result.skipped).map((result) => [result.iteration, result.name])).toEqual([
      [1, "Never sent"],
      [2, "Never sent"],
    ]);
    expect(report.results.some((result) => result.name === "After the end")).toBe(false);
  });

  it("requests before, between and after folders are sent in the file's order, as Newman sends them", async () => {
    const report = await run("order.postman_collection.json", {});

    expect(asNewman(report)).toEqual(orderGolden.items);
    expect(report.results.map((result) => result.name)).toEqual([
      "Before every folder",
      "First in the folder",
      "Deepest",
      "After the inner folder",
      "Between two folders",
      "In the last folder",
      "After every folder",
    ]);
  });
});
