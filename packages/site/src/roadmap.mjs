// The roadmap page, read from docs/roadmap.md at build time: each `## ` heading a list, each `- ` line under it an
// item, with the claims it names in a `<!-- claims C-001 -->` comment. A list whose title starts with "Shipped" is done.

/** @returns {{ title: string, shipped: boolean, items: { text: string, claims: string[] }[] }[]} */
export function roadmapOf(markdown) {
  const sections = [];
  for (const line of markdown.split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) sections.push({ title: heading[1].trim(), shipped: heading[1].startsWith("Shipped"), items: [] });
    const item = /^- (.+?)(?: <!-- claims ((?:C-\d{3} ?)+) -->)?$/.exec(line);
    if (item && sections.length)
      sections.at(-1).items.push({ text: item[1], claims: item[2]?.trim().split(" ") ?? [] });
  }
  return sections.filter((s) => s.items.length);
}
