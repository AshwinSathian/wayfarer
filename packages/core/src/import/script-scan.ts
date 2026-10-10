/**
 * What a script may use that the app does not have: the rows the
 * compatibility matrix (`test/pm-compat/cases.ts`) marks unsupported, as
 * text to look for in a script that is being imported. The matrix is test
 * data; this list is held equal to its unsupported rows by a test
 * (`import.spec.ts`), so a row added there must be added here or to
 * `NOT_SCANNED`.
 *
 * It reads text, not a program: a name in a comment or in a string is found
 * too. The report says "uses", and the script is not changed.
 */
interface ScanEntry {
  /** The matrix row, by its `api`. */
  api: string;
  /** What is looked for, each with the name the report gives it. */
  finds: [label: string, pattern: RegExp][];
}

/** Not part of a longer name, and not a member of something else. */
const START = String.raw`(?<![\w$.])`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

const member = (name: string): ScanEntry => ({ api: name, finds: [[name, new RegExp(`${START}${escape(name)}(?![\\w$])`)]] });
const required = (module: string): [string, RegExp] => [`require('${module}')`, new RegExp(`${START}require\\(\\s*["']${escape(module)}["']\\s*\\)`)];
const called = (name: string): [string, RegExp] => [name, new RegExp(`${START}${escape(name)}\\s*\\(`)];
const used = (name: string): [string, RegExp] => [name, new RegExp(`${START}${escape(name)}\\s*[.(]`)];

export const SCRIPT_SCAN: ScanEntry[] = [
  ...["pm.cookies.get", "pm.cookies.has", "pm.cookies.toObject", "pm.cookies.jar", "pm.visualizer.set", "pm.vault.get", "pm.require"].map(member),
  { api: "legacy library globals (_, CryptoJS, tv4, cheerio, xml2Json, Backbone)", finds: ["tv4", "cheerio", "xml2Json", "Backbone"].map(used) },
  { api: "clearTimeout, setInterval, clearInterval", finds: ["clearTimeout", "setInterval", "clearInterval"].map(called) },
  ...["ajv", "cheerio", "csv-parse/lib/sync", "postman-collection", "tv4", "xml2js"].map((module): ScanEntry => ({ api: `require('${module}')`, finds: [required(module)] })),
  {
    api: "require of a Node module (buffer, events, path, querystring, stream, string_decoder, timers, url, util)",
    finds: ["buffer", "events", "path", "querystring", "stream", "string_decoder", "timers", "url", "util"].map(required),
  },
];

/** Unsupported rows the scan does not look for, each with the reason. */
export const NOT_SCANNED: Record<string, string> = {
  "pm.sendRequest (formdata, file or graphql body)": "pm.sendRequest is supported; which body a call gives it is not known from the text.",
};
// Of the legacy globals, `_` and `CryptoJS` are not looked for: a script that
// requires lodash or crypto-js gives them those very names, and it works.

/** The names of what `script` uses that the app does not have, each once, in the list's order. */
export function unsupportedApis(script: string): string[] {
  return SCRIPT_SCAN.flatMap((entry) => entry.finds).filter(([, pattern]) => pattern.test(script)).map(([label]) => label);
}
