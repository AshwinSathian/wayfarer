import { redactExport, type ExportRequest, type ExportSource } from "./request";
import type { RedactOptions } from "../redact/redactor";

/**
 * What a copy says it did (U-050): what it was copied as, and what of the
 * request was masked in it. Each part is found by building the text again
 * with less masked and comparing, so the note says only what the redactor
 * did to this request: no "masked" where nothing was.
 *
 * `build` writes the format (`buildCurl`, a code generator) from a request
 * that went through `redactExport`, as the copy itself did.
 */
export function copyNote(
  format: string,
  source: ExportSource,
  options: RedactOptions,
  build: (request: ExportRequest) => string,
): string {
  const copied = build(redactExport(source, options));
  const withCredentials = build(redactExport(source, { credentials: true }));
  const unmasked = build(redactExport({ ...source, secrets: [] }, { credentials: true }));
  const credentials = !options.credentials && copied !== withCredentials;
  const secrets = withCredentials !== unmasked;
  const masked =
    credentials && secrets
      ? " Its credentials and vault secrets are replaced by ***."
      : credentials
        ? " Its credentials are replaced by ***."
        : secrets
          ? " Its vault secrets are replaced by ***."
          : "";
  const reference = copied.includes("{{$secret.") ? " A vault secret is copied as its reference, not its value." : "";
  return `Copied as ${format}${options.credentials ? ", with credentials" : ""}.${masked}${reference}`;
}
