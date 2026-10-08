import { recordDiagnostic } from "../../services/diagnostics";

/**
 * Best-effort clipboard write, shared by the composer's "Copy as cURL" and
 * the response viewer's "Copy as cURL"/"Copy as HAR" export actions.
 * Prefers the async Clipboard API; falls back to the classic hidden-textarea
 * + `execCommand("copy")` trick for browsers/contexts where
 * `navigator.clipboard` isn't available (e.g. non-secure contexts).
 */
export async function writeToClipboard(text: string): Promise<void> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (error) {
    // Permission denied or no focus: try the fallback below.
    recordDiagnostic(error, "clipboard: Clipboard API write failed, trying execCommand");
  }
  try {
    // Selecting the textarea takes focus; give it back afterwards.
    const focused = document.activeElement;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (focused instanceof HTMLElement) focused.focus();
    if (!copied) recordDiagnostic(new Error("execCommand('copy') returned false"), "clipboard");
  } catch (error) {
    recordDiagnostic(error, "clipboard: copy failed");
  }
}
