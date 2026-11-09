// The benchmark on the comparison pages (W5.4 of PLAN-design.md), read from docs/benchmark.md at build time, so
// a page cannot say other than the doc. Wayfarer's numbers are its "Wayfarer, measured" table; each rival's are the
// rows of each task's table, its documented steps. A table the pages need that is not there fails the build.
import GithubSlugger from "github-slugger";

/** Where the site serves the recordings of docs/benchmark/ (benchmark-recordings.mjs copies them there). */
export const RECORDINGS = "/benchmark/";

/** The cells of a Markdown table's rows, header and separator left out. */
function rows(lines) {
  return lines
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) =>
      line
        .slice(1, -1)
        .split(" | ")
        .map((cell) => cell.trim()),
    );
}

/** The lines of the section under a heading, up to the next heading of its level or above. */
function section(lines, heading) {
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`benchmark.md has no "${heading}"`);
  const level = heading.indexOf(" ");
  const end = lines.findIndex((line, i) => i > start && /^#+ /.test(line) && line.indexOf(" ") <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** A cell as plain text: bold, code marks and a link's address go. */
export const plain = (cell) =>
  cell
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

/** The addresses a source cell names, in order. */
export const urls = (cell) => [...cell.matchAll(/https:\/\/[^\s;)]+/g)].map((match) => match[0]);

/**
 * The benchmark as the pages show it: per task, its number, its name, its heading's id on /docs/benchmark/,
 * Wayfarer's measured rows (task 5 has three) and each rival's documented row.
 */
export function benchmarkOf(markdown) {
  const lines = markdown.split("\n");
  const measured = rows(section(lines, "## Wayfarer, measured")).map(([id, task, actions, , , , seconds, , rec]) => ({
    id,
    task,
    actions,
    seconds,
    recording: `${RECORDINGS}${/\(benchmark\/([^)]+)\)/.exec(rec)?.[1] ?? ""}`,
  }));
  const summary = rows(section(lines, "## Wayfarer against the rivals")).map(([n, task, wayfarer, fewest, is]) => ({
    n,
    task,
    wayfarer,
    fewest,
    is,
  }));
  const heading = (n) => lines.find((line) => line.startsWith(`### Task ${n}: `));
  const tasks = summary.map(({ n }) => {
    const title = heading(n);
    if (!title) throw new Error(`benchmark.md has no "### Task ${n}: "`);
    const anchor = new GithubSlugger().slug(title.slice(4));
    const table = rows(section(lines, title));
    const documented = table.map((cells) =>
      n === "5"
        ? { rival: cells[0], steps: "", inputs: "", sources: urls(cells[4]), note: `401: ${plain(cells[3])}` }
        : {
            rival: cells[0],
            steps: plain(cells[1]),
            inputs: plain(cells[2]),
            sources: urls(cells[4]),
            note: plain(cells[5]),
          },
    );
    return {
      n,
      name: title.replace(/^### Task \d+: /, ""),
      anchor,
      measured: measured.filter((row) => row.id.replace(/[a-z]$/, "") === n),
      documented,
    };
  });
  for (const task of tasks) if (!task.measured.length) throw new Error(`benchmark.md measures no task ${task.n}`);
  // Each rival's version, as "### Versions" gives it, to its first parenthesis: "v4.3.0, 22 Oct 2026".
  const versions = Object.fromEntries(
    section(lines, "### Versions")
      .map((line) => /^- \*\*([^*]+)\*\*: (.+?)(?: \(|\.\s|$)/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1], match[2]]),
  );
  return { tasks, summary, versions };
}
