/// <reference lib="webworker" />
/**
 * Turns a file's text into the app's model, off the page's thread (plan
 * P4.1): a large file is parsed, mapped and checked here, and the page
 * stays responsive. The page reads the file and hands over its text; this
 * worker fetches nothing and stores nothing.
 */
import { ImportError, importText, type ImportOptions } from "@wayfarer/core/import";
import type { Imported, ValidationIssue } from "@wayfarer/core";

export interface ImportJob {
  id: string;
  text: string;
  options: ImportOptions;
}

export type ImportAnswer = { id: string } & ({ imported: Imported } | { refused: { message: string; issues: ValidationIssue[] } });

addEventListener("message", (event: MessageEvent<ImportJob>) => {
  const { id, text, options } = event.data;
  let answer: ImportAnswer;
  try {
    answer = { id, imported: importText(text, options) };
  } catch (error) {
    // An importer throws nothing else; anything else is a defect and is reported as the page's error.
    if (!(error instanceof ImportError)) throw error;
    answer = { id, refused: { message: error.message, issues: error.issues } };
  }
  postMessage(answer);
});
