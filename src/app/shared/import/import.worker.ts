/// <reference lib="webworker" />
/**
 * Turns a file's text into the app's model, off the page's thread (plan
 * P4.1): a large file is parsed, mapped and checked here, and the page
 * stays responsive. The page reads the file and hands over its text; this
 * worker fetches nothing and stores nothing.
 */
import { ImportError, curlToRequest, importText, type ImportOptions } from "@wayfarer/core/import";
import type { Imported, RequestContent, ValidationIssue } from "@wayfarer/core";

/** A file's text to import, or (`curl`) a pasted command to turn into one request for the composer. */
export interface ImportJob {
  id: string;
  text: string;
  options: ImportOptions;
  curl?: true;
}

/** A pasted cURL command as a request, with what of it was left out. */
export interface PastedRequest {
  content: RequestContent;
  warnings: string[];
}

export type ImportAnswer = { id: string } & ({ imported: Imported } | { request: PastedRequest } | { refused: { message: string; issues: ValidationIssue[] } });

addEventListener("message", (event: MessageEvent<ImportJob>) => {
  const { id, text, options, curl } = event.data;
  let answer: ImportAnswer;
  try {
    if (curl) {
      const { content, warnings } = curlToRequest(text);
      answer = { id, request: { content, warnings } };
    } else {
      answer = { id, imported: importText(text, options) };
    }
  } catch (error) {
    // An importer throws nothing else; anything else is a defect and is reported as the page's error.
    if (!(error instanceof ImportError)) throw error;
    answer = { id, refused: { message: error.message, issues: error.issues } };
  }
  postMessage(answer);
});
