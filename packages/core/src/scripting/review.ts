/** `pm.sendRequest`, as a script names it: `pm.sendRequest(`, `pm . sendRequest`, `pm["sendRequest"]`, `const { sendRequest } = pm`. */
const SEND_REQUEST = /\bsendRequest\b/;
const VARIABLES = /\bpm\s*\.\s*(?:environment|collectionVariables|globals|variables)\b/;

/** What a script's text shows of what it can do, for the review: the lines that name `sendRequest`, and whether it names variables. */
export interface ScriptFlags {
  /** 1-based line numbers. A name built at run time (`pm["send" + "Request"]`) is not found: the code is what is read. */
  sendRequestLines: number[];
  variables: boolean;
}

export function scriptFlags(text: string): ScriptFlags {
  const sendRequestLines = text.split(/\r?\n/).flatMap((line, index) => (SEND_REQUEST.test(line) ? [index + 1] : []));
  return { sendRequestLines, variables: VARIABLES.test(text) };
}
