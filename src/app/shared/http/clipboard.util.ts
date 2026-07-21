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
  } catch {
    // Fallback below.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  } catch {
    console.warn("Failed to copy to clipboard.");
  }
}
