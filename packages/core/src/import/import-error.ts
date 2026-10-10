import type { ValidationIssue } from "../model/validate";

/**
 * Why a file was not imported. The message is user-facing; `issues` name
 * each field that is wrong, when the file is of a known format. An importer
 * throws nothing else (plan P4.1).
 */
export class ImportError extends Error {
  override readonly name = "ImportError";

  constructor(
    message: string,
    readonly issues: ValidationIssue[] = []
  ) {
    super(message);
  }
}
