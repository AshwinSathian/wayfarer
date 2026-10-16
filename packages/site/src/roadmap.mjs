// The roadmap page (W2.4 of PLAN-design.md) is the plan's phases and tasks, read from PLAN-design.md at build
// time: each phase's title, and each task's ID, its first sentence and whether it is ticked.

/** @returns {{ title: string, tasks: { id: string, done: boolean, text: string }[] }[]} */
export function roadmapOf(plan) {
  const phases = [];
  let task = null;
  for (const line of plan.split("\n")) {
    const phase = /^### (Phase [^(]+?)\s*(?:\(.*\))?$/.exec(line);
    if (phase) {
      phases.push({ title: phase[1], tasks: [] });
      task = null;
      continue;
    }
    if (/^## /.test(line)) {
      task = null;
      if (phases.length) break;
      continue;
    }
    const item = /^- \[([ x])\] \*\*([A-Z]+\d+(?:\.\d+)?)\*\* (.*)$/.exec(line);
    if (item && phases.length) {
      task = { id: item[2], done: item[1] === "x", text: item[3] };
      phases.at(-1).tasks.push(task);
      continue;
    }
    // A task's text goes on over its indented lines, up to its AC.
    if (task && /^ {2}\S/.test(line) && !/^ {2}- /.test(line)) task.text += ` ${line.trim()}`;
    else task = null;
  }
  for (const { tasks } of phases) {
    for (const t of tasks) t.text = firstSentence(t.text.replace(/[`*]/g, ""));
  }
  return phases;
}

function firstSentence(text) {
  const end = /[.:](\s|$)/.exec(text);
  return (end ? text.slice(0, end.index + 1) : text).replace(/:$/, ".");
}
