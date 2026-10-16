// The ledger's last CI result (W2.4 of PLAN-design.md). A deploy writes /ci-run.json: the CI run on main whose
// files it deployed, which deploy.yml takes only when every job of it passed, and a claim test is never retried.
// So every claim test that ran in that run passed, and this script says so on each row of the ledger.
// Text only (textContent), from the site's own file; a copy of the site with no such file says it has none.
const RUNS = "https://github.com/AshwinSathian/wayfarer/actions/runs/";
const table = document.querySelector("article table");
const note = document.createElement("p");
note.className = "ci-note";
table?.before(note);

const link = (text, href) => Object.assign(document.createElement("a"), { textContent: text, href });

/** The file's run, if it is one: a run number, a commit's 40 hex digits and a date. */
function runOf(data) {
  const ok = data && Number.isSafeInteger(data.run) && data.run > 0 && /^[0-9a-f]{40}$/.test(data.commit) && typeof data.date === "string" && !Number.isNaN(Date.parse(data.date));
  return ok ? { run: data.run, commit: data.commit, date: new Date(data.date).toISOString().slice(0, 10), url: RUNS + data.run } : null;
}

fetch("/ci-run.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : null))
  .catch(() => null)
  .then((data) => {
    if (!table) return;
    const run = runOf(data);
    if (!run) {
      note.textContent = "This copy of the site was not deployed from a CI run, so it shows no test results. Each claim's tests are named in its row.";
      return;
    }
    note.append(
      "This site was deployed from commit ",
      Object.assign(document.createElement("code"), { textContent: run.commit.slice(0, 12) }),
      ", which passed ",
      link(`CI run ${run.run}`, run.url),
      ` on ${run.date}: no test failed in it, and a claim test is not retried. A test that does not run in an engine (one only Chromium can run, for example) is not counted there.`
    );
    const head = table.querySelector("thead tr");
    head?.append(Object.assign(document.createElement("th"), { textContent: "Last CI" }));
    for (const row of table.querySelectorAll("tbody tr")) {
      const cell = document.createElement("td");
      cell.append(link("Passed", run.url));
      row.append(cell);
    }
  });
