import type { ExportRequest } from "../../src/export/request";

const HOSTILE = `it's "quoted" \\ $(touch pwned) \`id\`\n</script>`;

/**
 * Twelve requests that cover every body mode, as built, to a server at
 * `base`. The files they name are `FILES`, which a test writes beside the
 * code it runs.
 */
export const exportFixtures = (base: string): { name: string; request: ExportRequest }[] => [
  { name: "GET with a query and headers", request: { method: "GET", url: `${base}/echo?a=1&b=two%20words`, headers: [["Accept", "application/json"], ["X-Trace", "t-1"]], body: { mode: "none" } } },
  { name: "HEAD", request: { method: "HEAD", url: `${base}/echo?head=1`, headers: [["X-Trace", "t-2"]], body: { mode: "none" } } },
  { name: "DELETE without a body", request: { method: "DELETE", url: `${base}/echo`, headers: [], body: { mode: "none" } } },
  { name: "POST JSON", request: { method: "POST", url: `${base}/echo`, headers: [["Content-Type", "application/json"]], body: { mode: "raw", text: '{"name":"héllo","n":1}' } } },
  { name: "PUT text that tries to leave its quotes", request: { method: "PUT", url: `${base}/echo`, headers: [["Content-Type", "text/plain"], ["X-Note", "it's"]], body: { mode: "raw", text: HOSTILE } } },
  { name: "POST text that starts with @", request: { method: "POST", url: `${base}/echo`, headers: [["Content-Type", "text/plain"]], body: { mode: "raw", text: "@/etc/passwd" } } },
  { name: "PATCH with a method of its own kind", request: { method: "PURGE", url: `${base}/echo`, headers: [["Content-Type", "application/xml"]], body: { mode: "raw", text: "<a>1</a>" } } },
  {
    name: "POST form",
    request: { method: "POST", url: `${base}/echo`, headers: [["Content-Type", "application/x-www-form-urlencoded"]], body: { mode: "urlencoded", fields: [["q", "a b&c=d"], ["na me", "é"], ["at", "@/etc/passwd"], ["empty", ""]] } },
  },
  { name: "POST form with one field", request: { method: "POST", url: `${base}/echo`, headers: [["Content-Type", "application/x-www-form-urlencoded"]], body: { mode: "urlencoded", fields: [["only", "1"]] } } },
  { name: "POST multipart text", request: { method: "POST", url: `${base}/echo`, headers: [["X-Trace", "t-10"]], body: { mode: "multipart", parts: [{ name: "note", value: "héllo" }, { name: "second", value: "two words; type=x" }] } } },
  { name: "POST multipart with a file", request: { method: "POST", url: `${base}/echo`, headers: [], body: { mode: "multipart", parts: [{ name: "note", value: "with a file" }, { name: "upload", fileName: "upload file.bin" }] } } },
  { name: "PUT a file", request: { method: "PUT", url: `${base}/echo`, headers: [["Content-Type", "image/png"]], body: { mode: "binary", fileName: "pixel.png" } } },
];

/** Every byte value, twice: a file no text encoding leaves alone. */
const bytes = Uint8Array.from({ length: 512 }, (_, index) => index % 256);
export const FILES: Record<string, Uint8Array> = { "upload file.bin": bytes, "pixel.png": bytes.slice(0, 64) };
