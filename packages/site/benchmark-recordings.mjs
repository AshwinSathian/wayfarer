// The benchmark's recordings (docs/benchmark/task-*.webm) served by the site at /benchmark/ (W5.4 of
// PLAN-design.md): the comparison pages and the benchmark's page link each of Wayfarer's numbers to its recording.
// Run after `next build`, with the output folder: node benchmark-recordings.mjs out
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const from = "../../docs/benchmark";
const to = join(process.argv[2] ?? "out", "benchmark");
mkdirSync(to, { recursive: true });
const files = readdirSync(from).filter((name) => name.endsWith(".webm"));
for (const name of files) copyFileSync(join(from, name), join(to, name));
console.log(`benchmark-recordings: ${files.length} recordings in ${to}`);
