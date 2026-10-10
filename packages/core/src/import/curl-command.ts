/**
 * True when `text` is a cURL command: its first word is `curl`. By itself
 * in this file: the page asks this of every paste into the address field,
 * and loads the parser only when the answer is yes.
 */
export function isCurlCommand(text: string): boolean {
  return /^\s*curl(\.exe)?(\s|$)/i.test(text);
}
