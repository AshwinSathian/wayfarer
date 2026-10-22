import { recordDiagnostic } from "../../services/diagnostics";

/**
 * Best-effort clipboard write, shared by the composer's "Copy as cURL" and
 * the response viewer's "Copy as cURL"/"Copy as HAR" export actions.
 * Prefers the async Clipboard API; falls back to the classic hidden-textarea
 * + `execCommand("copy")` trick for browsers/contexts where
 * `navigator.clipboard` isn't available (e.g. non-secure contexts).
 * Resolves to whether the text was copied, so that what says so is true.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
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
    // In the modal dialog that has focus (the HAR export, Settings' diagnostics): outside it the page is inert.
    (focused?.closest("dialog") ?? document.body).append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (focused instanceof HTMLElement) focused.focus();
    if (!copied) recordDiagnostic(new Error("execCommand('copy') returned false"), "clipboard");
    return copied;
  } catch (error) {
    recordDiagnostic(error, "clipboard: copy failed");
    return false;
  }
}

/** What a copy says when the browser refused it. */
export const NOT_COPIED = "The browser did not let Wayfarer write to the clipboard. Nothing was copied.";
