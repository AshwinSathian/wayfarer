/** A doc's title: its first heading, or its file's name. */
export function titleOf(doc: { id: string; body?: string }): string {
  return /^# (.+)$/m.exec(doc.body ?? "")?.[1].replace(/`/g, "") ?? doc.id;
}
