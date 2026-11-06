// The roadmap page (W2.4 of PLAN-design.md), read from PLAN-design.md at build time. The plan is written for the
// people building Wayfarer; the page is for the people using it. So the page shows ITEMS, each a sentence of what a
// user gets, resting on the plan's tasks: the plan says which phase each is in and whether it is done. A task of the
// plan that a user never sees (research, a review, the website's own work) is in INTERNAL. roadmap.test.mjs fails
// when the plan has a task that is in neither, so a new task is worded here before it can be forgotten.

/** The phases after 3.0: Next, then Later. Every other phase is the 3.0 rebuild. */
const NEXT = new Set(["D6"]);
const LATER = new Set(["T"]);

/** @type {{ tasks: string[], text: string, claims?: string[] }[]} */
export const ITEMS = [
  {
    tasks: ["D2.5", "D4.12"],
    text: "Every response comes with a record of where the request went: the route it took, the host, which secrets were filled in (by name, never by value) and what History kept.",
    claims: ["C-008"],
  },
  {
    tasks: ["D4.3"],
    text: "Before you send, the composer shows the address as it will go out, where each variable's value comes from, and which ones have no value yet.",
    claims: ["C-025", "C-045", "C-049"],
  },
  {
    tasks: ["D3.7"],
    text: "A reply that takes under a second appears at once, with no spinner first, and the status line gives the time it really took.",
  },
  {
    tasks: ["D4.2"],
    text: "From an empty app to a first response in two steps: paste or type an address, then Send.",
  },
  {
    tasks: ["D2.4", "D3.1", "D3.2", "D3.6"],
    text: "A new look in light and dark: one ink colour for everything you act on, colour kept for methods and status codes, and type in which 0 and O, or l and 1, never look alike.",
    claims: ["C-037"],
  },
  {
    tasks: ["D2.2"],
    text: "The app's words rewritten to say plainly what happened and what you can do next.",
  },
  {
    tasks: ["D3.3", "D3.5", "D4.11"],
    text: "The core flow works from the keyboard alone, the main views and dialogs have no accessibility violation an automated scan finds, and every view holds at 320 px wide.",
    claims: ["C-038", "C-067"],
  },
  {
    tasks: ["D4.4", "D4.5"],
    text: "Environments open in a tab, as a request does, and save each row as you leave it. A deleted request, folder or environment can be put back for 10 seconds.",
  },
  {
    tasks: ["D4.6", "D4.9"],
    text: "Collection runs and their reports look and read the same in the app and on the command line.",
    claims: ["C-065"],
  },
  {
    tasks: ["D4.7"],
    text: "Settings in one place, with the Local Bridge, routes, import and export each in a section of its own.",
    claims: ["C-033"],
  },
  {
    tasks: ["D1.7", "D4.10"],
    text: "If you add an AI provider, it can draft a request from a description, write tests from a response and explain a failed one. You see every byte before it leaves, and nothing changes until you accept it.",
    claims: ["C-069", "C-071", "C-073"],
  },
  {
    tasks: ["D4.13"],
    text: "The installed app follows your theme and fits a phone's screen.",
    claims: ["C-036"],
  },
  {
    tasks: ["D6.1"],
    text: "Fixes for the rough edges found in the last review before 3.0.",
  },
  {
    tasks: ["T1"],
    text: "Share a collection with your team as a file, or as a link whose encrypted contents never reach a server, and see every host it sends to before you import it.",
    claims: ["C-084", "C-086", "C-090"],
  },
  {
    tasks: ["T2"],
    text: "Keep collections in a Git repository, and see each change and its diff before you take it.",
  },
  {
    tasks: ["T3"],
    text: "Work on the same collection as your team in real time, end-to-end encrypted, with no server of ours in between.",
  },
  {
    tasks: ["T4"],
    text: "Run a Wayfarer server of your own for your team, from one Docker image.",
  },
];

/** The plan's tasks a user never sees: research, reviews, process, and the website's own work. */
export const INTERNAL = new Set([
  ...["D0.1", "D0.2", "D0.3"],
  ...["D1.1", "D1.2", "D1.3", "D1.4", "D1.5", "D1.6", "D1.8", "D1.9"],
  ...["D2.1", "D2.3", "D3.4", "D4.1", "D4.8", "D5.1", "D5.2", "T0"],
  ...["W0.1", "W0.2", "W1.1", "W1.2", "W2.1", "W2.2", "W2.3", "W2.4", "W2.5", "W3.1", "W3.2", "W3.6", "W4"],
  ...["W5.1", "W5.2", "W5.3", "W5.4", "W5.5"],
  ...["W6.1", "W6.2", "W6.3", "W6.4", "W6.5", "W6.6", "W6.7", "W6.8", "W6.9"],
]);

/**
 * The page's lists. The first is "Shipped in 3.0" once the plan ticks the release (D5.2), else "Coming in 3.0". The
 * work after 3.0 (D6, then Teams) is "Shipped since 3.0" when the plan ticks all of an item's tasks; of what is left,
 * the first item is "Next" and the rest "Later".
 * @returns {{ title: string, shipped: boolean, items: { text: string, claims: string[], done: boolean }[] }[]}
 */
export function roadmapOf(plan) {
  const tasks = new Map(phasesOf(plan).flatMap(({ id, tasks }) => tasks.map((t) => [t.id, { ...t, phase: id }])));
  const released = tasks.get("D5.2")?.done ?? false;
  const rebuild = [];
  const after = [];
  for (const item of ITEMS) {
    const of = item.tasks.map((id) => tasks.get(id)).filter(Boolean);
    if (!of.length) continue;
    const phase = of[0].phase; // An item's tasks are of one list: the 3.0 rebuild, or what comes after it.
    const later = LATER.has(phase) || NEXT.has(phase);
    (later ? after : rebuild).push({
      text: item.text,
      claims: item.claims ?? [],
      done: later && of.every((t) => t.done),
    });
  }
  const open = after.filter((i) => !i.done);
  const sections = [
    { title: released ? "Shipped in 3.0" : "Coming in 3.0", shipped: released, items: rebuild },
    { title: "Shipped since 3.0", shipped: true, items: after.filter((i) => i.done) },
    { title: "Next", shipped: false, items: open.slice(0, 1) },
    { title: "Later", shipped: false, items: open.slice(1) },
  ];
  return sections.filter((s) => s.items.length);
}

/**
 * The plan's phases in section 9, each with its tasks: the phase's id (`D6`, `T`), and each task's id and whether
 * it is ticked.
 * @returns {{ id: string, tasks: { id: string, done: boolean }[] }[]}
 */
export function phasesOf(plan) {
  const phases = [];
  for (const line of plan.split("\n")) {
    const phase = /^### Phase (\w+):/.exec(line);
    if (phase) phases.push({ id: phase[1], tasks: [] });
    else if (/^## /.test(line) && phases.length) break;
    const item = /^- \[([ x])\] \*\*([A-Z]+\d+(?:\.\d+)?)\*\*/.exec(line);
    if (item && phases.length) phases.at(-1).tasks.push({ id: item[2], done: item[1] === "x" });
  }
  return phases;
}
