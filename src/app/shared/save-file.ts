/** Hands `json` to the browser as a download named `name`. */
export function saveJsonFile(name: string, json: string): void {
  saveFile(name, json, "application/json");
}

/** Hands `text` to the browser as a download named `name`, of the type given: one of the app's own, never a server's. */
export function saveFile(name: string, text: string, type: "application/json" | "application/xml"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
