import type { ExportBody } from "../../../src/export/request";

/**
 * Thirty cURL commands in the form each browser's "Copy as cURL" writes.
 *
 * **Written, not captured** (maintainer, 2026-10-10): a test session cannot
 * press the menu item in a browser's developer tools. Each is written to
 * the shape that browser produces (its quoting, its options, its header
 * names and order), against an address that does not exist. One captured
 * from a real browser can be added beside them, marked `captured: true`.
 */
export interface CurlFixture {
  name: string;
  from: "Chrome (bash)" | "Chrome (cmd)" | "Firefox" | "Safari";
  captured?: true;
  command: string;
  method: string;
  url: string;
  /** Every header, in order, cookies given with `-b` as a `Cookie` header. */
  headers: [string, string][];
  body: ExportBody;
  /** How many things the import says it left out. */
  warnings?: number;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const FX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0";
const SF = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const none: ExportBody = { mode: "none" };
const json = "application/json";

export const CURL_FIXTURES: CurlFixture[] = [
  // ── Chrome, "Copy as cURL (bash)": one option a line, lower-case names, cookies with -b, a body with --data-raw.
  {
    name: "a GET with the headers Chrome adds",
    from: "Chrome (bash)",
    command: `curl 'https://api.example.test/users?page=2&per_page=50' \\\n  -H 'accept: application/json' \\\n  -H 'accept-language: en-GB,en;q=0.9' \\\n  -H 'sec-ch-ua: "Chromium";v="141", "Not?A_Brand";v="8"' \\\n  -H 'sec-ch-ua-mobile: ?0' \\\n  -H 'user-agent: ${UA}'`,
    method: "GET",
    url: "https://api.example.test/users?page=2&per_page=50",
    headers: [["accept", json], ["accept-language", "en-GB,en;q=0.9"], ["sec-ch-ua", '"Chromium";v="141", "Not?A_Brand";v="8"'], ["sec-ch-ua-mobile", "?0"], ["user-agent", UA]],
    body: none,
  },
  {
    name: "cookies with -b",
    from: "Chrome (bash)",
    command: `curl 'https://app.example.test/api/me' \\\n  -H 'accept: */*' \\\n  -b 'session=abc123; theme=dark; _ga=GA1.1.1234' \\\n  -H 'referer: https://app.example.test/'`,
    method: "GET",
    url: "https://app.example.test/api/me",
    headers: [["accept", "*/*"], ["Cookie", "session=abc123; theme=dark; _ga=GA1.1.1234"], ["referer", "https://app.example.test/"]],
    body: none,
  },
  {
    name: "a POST of JSON",
    from: "Chrome (bash)",
    command: `curl 'https://api.example.test/users' \\\n  -H 'accept: application/json' \\\n  -H 'content-type: application/json' \\\n  -H 'origin: https://app.example.test' \\\n  --data-raw '{"name":"Ada","roles":["admin","dev"]}'`,
    method: "POST",
    url: "https://api.example.test/users",
    headers: [["accept", json], ["content-type", json], ["origin", "https://app.example.test"]],
    body: { mode: "raw", text: '{"name":"Ada","roles":["admin","dev"]}' },
  },
  {
    name: "a body with a quote and a line break, in $'…'",
    from: "Chrome (bash)",
    command: `curl 'https://api.example.test/notes' \\\n  -H 'content-type: application/json' \\\n  --data-raw $'{"text":"it\\'s two\\\\nlines","bang":"\\u0021"}'`,
    method: "POST",
    url: "https://api.example.test/notes",
    headers: [["content-type", json]],
    body: { mode: "raw", text: `{"text":"it's two\\nlines","bang":"!"}` },
  },
  {
    name: "a PUT, with -X",
    from: "Chrome (bash)",
    command: `curl 'https://api.example.test/users/42' \\\n  -X 'PUT' \\\n  -H 'content-type: application/json' \\\n  -H 'authorization: Bearer eyJhbGciOi.example.sig' \\\n  --data-raw '{"name":"Ada L."}'`,
    method: "PUT",
    url: "https://api.example.test/users/42",
    headers: [["content-type", json], ["authorization", "Bearer eyJhbGciOi.example.sig"]],
    body: { mode: "raw", text: '{"name":"Ada L."}' },
  },
  {
    name: "a DELETE",
    from: "Chrome (bash)",
    command: `curl 'https://api.example.test/users/42' \\\n  -X 'DELETE' \\\n  -H 'accept: */*'`,
    method: "DELETE",
    url: "https://api.example.test/users/42",
    headers: [["accept", "*/*"]],
    body: none,
  },
  {
    name: "a form",
    from: "Chrome (bash)",
    command: `curl 'https://app.example.test/login' \\\n  -H 'content-type: application/x-www-form-urlencoded' \\\n  --data-raw 'user=ada%40example.test&password=p%26ss+word&remember=on'`,
    method: "POST",
    url: "https://app.example.test/login",
    headers: [["content-type", "application/x-www-form-urlencoded"]],
    body: { mode: "urlencoded", fields: [["user", "ada@example.test"], ["password", "p&ss word"], ["remember", "on"]] },
  },
  {
    name: "a multipart form, as the bytes that were sent",
    from: "Chrome (bash)",
    command: `curl 'https://app.example.test/upload' \\\n  -H 'content-type: multipart/form-data; boundary=----WebKitFormBoundaryAbC123' \\\n  --data-raw $'------WebKitFormBoundaryAbC123\\r\\nContent-Disposition: form-data; name="note"\\r\\n\\r\\nhello\\r\\n------WebKitFormBoundaryAbC123--\\r\\n'`,
    method: "POST",
    url: "https://app.example.test/upload",
    headers: [["content-type", "multipart/form-data; boundary=----WebKitFormBoundaryAbC123"]],
    body: { mode: "raw", text: '------WebKitFormBoundaryAbC123\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello\r\n------WebKitFormBoundaryAbC123--\r\n' },
  },
  {
    name: "a self-signed dev server, with --insecure",
    from: "Chrome (bash)",
    command: `curl 'https://localhost:8443/health' \\\n  -H 'accept: */*' \\\n  --insecure`,
    method: "GET",
    url: "https://localhost:8443/health",
    headers: [["accept", "*/*"]],
    body: none,
    warnings: 1,
  },
  {
    name: "a GraphQL query",
    from: "Chrome (bash)",
    command: `curl 'https://api.example.test/graphql' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{"query":"query Me { me { id name } }","variables":{}}'`,
    method: "POST",
    url: "https://api.example.test/graphql",
    headers: [["content-type", json]],
    body: { mode: "raw", text: '{"query":"query Me { me { id name } }","variables":{}}' },
  },

  // ── Chrome, "Copy as cURL (cmd)": double quotes, ^ before what cmd would read, ^ at a line's end.
  {
    name: "a GET",
    from: "Chrome (cmd)",
    command: `curl "https://api.example.test/users?page=2^&per_page=50" ^\r\n  -H "accept: application/json" ^\r\n  -H "accept-language: en-GB,en;q=0.9"`,
    method: "GET",
    url: "https://api.example.test/users?page=2&per_page=50",
    headers: [["accept", json], ["accept-language", "en-GB,en;q=0.9"]],
    body: none,
  },
  {
    name: "a header with quotes in it",
    from: "Chrome (cmd)",
    command: `curl "https://api.example.test/" ^\r\n  -H "sec-ch-ua: ^\\^"Chromium^\\^";v=^\\^"141^\\^", ^\\^"Not?A_Brand^\\^";v=^\\^"8^\\^"" ^\r\n  -H "sec-ch-ua-platform: ^\\^"Windows^\\^""`,
    method: "GET",
    url: "https://api.example.test/",
    headers: [["sec-ch-ua", '"Chromium";v="141", "Not?A_Brand";v="8"'], ["sec-ch-ua-platform", '"Windows"']],
    body: none,
  },
  {
    name: "a POST of JSON",
    from: "Chrome (cmd)",
    command: `curl "https://api.example.test/users" ^\r\n  -H "content-type: application/json" ^\r\n  --data-raw "^{^\\^"name^\\^":^\\^"Ada^\\^",^\\^"n^\\^":1^}"`,
    method: "POST",
    url: "https://api.example.test/users",
    headers: [["content-type", json]],
    body: { mode: "raw", text: '{"name":"Ada","n":1}' },
  },
  {
    name: "cookies and a percent sign",
    from: "Chrome (cmd)",
    command: `curl "https://app.example.test/search?q=100^%25" ^\r\n  -b "session=abc123; theme=dark" ^\r\n  -H "accept: */*"`,
    method: "GET",
    url: "https://app.example.test/search?q=100%25",
    headers: [["Cookie", "session=abc123; theme=dark"], ["accept", "*/*"]],
    body: none,
  },
  {
    name: "a PATCH",
    from: "Chrome (cmd)",
    command: `curl "https://api.example.test/users/42" ^\r\n  -X "PATCH" ^\r\n  -H "content-type: application/json" ^\r\n  --data-raw "^{^\\^"active^\\^":false^}"`,
    method: "PATCH",
    url: "https://api.example.test/users/42",
    headers: [["content-type", json]],
    body: { mode: "raw", text: '{"active":false}' },
  },
  {
    name: "a form",
    from: "Chrome (cmd)",
    command: `curl "https://app.example.test/login" ^\r\n  -H "content-type: application/x-www-form-urlencoded" ^\r\n  --data-raw "user=ada^%40example.test^&remember=on"`,
    method: "POST",
    url: "https://app.example.test/login",
    headers: [["content-type", "application/x-www-form-urlencoded"]],
    body: { mode: "urlencoded", fields: [["user", "ada@example.test"], ["remember", "on"]] },
  },
  {
    name: "a HEAD",
    from: "Chrome (cmd)",
    command: `curl "https://cdn.example.test/app.js" ^\r\n  -X "HEAD" ^\r\n  -H "accept: */*"`,
    method: "HEAD",
    url: "https://cdn.example.test/app.js",
    headers: [["accept", "*/*"]],
    body: none,
  },

  // ── Firefox, "Copy as cURL (POSIX)": one line, --compressed, -X and the headers, Title-Case names.
  {
    name: "a GET",
    from: "Firefox",
    command: `curl 'https://api.example.test/users?page=2' --compressed -H 'User-Agent: ${FX}' -H 'Accept: application/json' -H 'Accept-Language: en-GB,en;q=0.5' -H 'Accept-Encoding: gzip, deflate, br, zstd' -H 'Connection: keep-alive'`,
    method: "GET",
    url: "https://api.example.test/users?page=2",
    headers: [["User-Agent", FX], ["Accept", json], ["Accept-Language", "en-GB,en;q=0.5"], ["Accept-Encoding", "gzip, deflate, br, zstd"], ["Connection", "keep-alive"]],
    body: none,
    warnings: 1,
  },
  {
    name: "a POST of JSON",
    from: "Firefox",
    command: `curl 'https://api.example.test/users' --compressed -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' -H 'Origin: https://app.example.test' --data-raw '{"name":"Ada"}'`,
    method: "POST",
    url: "https://api.example.test/users",
    headers: [["Accept", json], ["Content-Type", json], ["Origin", "https://app.example.test"]],
    body: { mode: "raw", text: '{"name":"Ada"}' },
    warnings: 1,
  },
  {
    name: "a cookie as a header",
    from: "Firefox",
    command: `curl 'https://app.example.test/api/me' -H 'Accept: */*' -H 'Cookie: session=abc123; theme=dark' -H 'Sec-Fetch-Dest: empty' -H 'Sec-Fetch-Mode: cors'`,
    method: "GET",
    url: "https://app.example.test/api/me",
    headers: [["Accept", "*/*"], ["Cookie", "session=abc123; theme=dark"], ["Sec-Fetch-Dest", "empty"], ["Sec-Fetch-Mode", "cors"]],
    body: none,
  },
  {
    name: "a form",
    from: "Firefox",
    command: `curl 'https://app.example.test/login' --compressed -X POST -H 'Content-Type: application/x-www-form-urlencoded' --data-raw 'user=ada%40example.test&password=s3cret'`,
    method: "POST",
    url: "https://app.example.test/login",
    headers: [["Content-Type", "application/x-www-form-urlencoded"]],
    body: { mode: "urlencoded", fields: [["user", "ada@example.test"], ["password", "s3cret"]] },
    warnings: 1,
  },
  {
    name: "a multipart form, as --data-binary",
    from: "Firefox",
    command: `curl 'https://app.example.test/upload' -X POST -H 'Content-Type: multipart/form-data; boundary=----geckoformboundary1a2b' --data-binary $'------geckoformboundary1a2b\\r\\nContent-Disposition: form-data; name="note"\\r\\n\\r\\nhello\\r\\n------geckoformboundary1a2b--\\r\\n'`,
    method: "POST",
    url: "https://app.example.test/upload",
    headers: [["Content-Type", "multipart/form-data; boundary=----geckoformboundary1a2b"]],
    body: { mode: "raw", text: '------geckoformboundary1a2b\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello\r\n------geckoformboundary1a2b--\r\n' },
  },
  {
    name: "a DELETE",
    from: "Firefox",
    command: `curl 'https://api.example.test/users/42' -X DELETE -H 'Accept: */*' -H 'Authorization: Bearer eyJhbGciOi.example.sig'`,
    method: "DELETE",
    url: "https://api.example.test/users/42",
    headers: [["Accept", "*/*"], ["Authorization", "Bearer eyJhbGciOi.example.sig"]],
    body: none,
  },
  {
    name: "an OPTIONS preflight",
    from: "Firefox",
    command: `curl 'https://api.example.test/users' -X OPTIONS -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' -H 'Origin: https://app.example.test'`,
    method: "OPTIONS",
    url: "https://api.example.test/users",
    headers: [["Access-Control-Request-Method", "POST"], ["Access-Control-Request-Headers", "content-type"], ["Origin", "https://app.example.test"]],
    body: none,
  },

  // ── Safari, "Copy as cURL": -X with the method quoted, each option on a line of its own, a body with --data-binary.
  {
    name: "a GET",
    from: "Safari",
    command: `curl 'https://api.example.test/users?page=2' \\\n-X 'GET' \\\n-H 'Accept: application/json' \\\n-H 'Sec-Fetch-Site: same-site' \\\n-H 'Accept-Language: en-GB,en;q=0.9' \\\n-H 'User-Agent: ${SF}'`,
    method: "GET",
    url: "https://api.example.test/users?page=2",
    headers: [["Accept", json], ["Sec-Fetch-Site", "same-site"], ["Accept-Language", "en-GB,en;q=0.9"], ["User-Agent", SF]],
    body: none,
  },
  {
    name: "a POST of JSON",
    from: "Safari",
    command: `curl 'https://api.example.test/users' \\\n-X 'POST' \\\n-H 'Content-Type: application/json' \\\n-H 'Accept: application/json' \\\n-H 'Origin: https://app.example.test' \\\n-H 'Content-Length: 14' \\\n--data-binary '{"name":"Ada"}'`,
    method: "POST",
    url: "https://api.example.test/users",
    headers: [["Content-Type", json], ["Accept", json], ["Origin", "https://app.example.test"], ["Content-Length", "14"]],
    body: { mode: "raw", text: '{"name":"Ada"}' },
  },
  {
    name: "a cookie as a header",
    from: "Safari",
    command: `curl 'https://app.example.test/api/me' \\\n-X 'GET' \\\n-H 'Accept: */*' \\\n-H 'Cookie: session=abc123; theme=dark'`,
    method: "GET",
    url: "https://app.example.test/api/me",
    headers: [["Accept", "*/*"], ["Cookie", "session=abc123; theme=dark"]],
    body: none,
  },
  {
    name: "a form",
    from: "Safari",
    command: `curl 'https://app.example.test/login' \\\n-X 'POST' \\\n-H 'Content-Type: application/x-www-form-urlencoded' \\\n--data-binary 'user=ada%40example.test&remember=on'`,
    method: "POST",
    url: "https://app.example.test/login",
    headers: [["Content-Type", "application/x-www-form-urlencoded"]],
    body: { mode: "urlencoded", fields: [["user", "ada@example.test"], ["remember", "on"]] },
  },
  {
    name: "a PUT with a quote in the body",
    from: "Safari",
    command: `curl 'https://api.example.test/notes/7' \\\n-X 'PUT' \\\n-H 'Content-Type: text/plain' \\\n--data-binary 'it'\\''s done'`,
    method: "PUT",
    url: "https://api.example.test/notes/7",
    headers: [["Content-Type", "text/plain"]],
    body: { mode: "raw", text: "it's done" },
  },
  {
    name: "a DELETE",
    from: "Safari",
    command: `curl 'https://api.example.test/users/42' \\\n-X 'DELETE' \\\n-H 'Accept: */*' \\\n-H 'Authorization: Bearer eyJhbGciOi.example.sig'`,
    method: "DELETE",
    url: "https://api.example.test/users/42",
    headers: [["Accept", "*/*"], ["Authorization", "Bearer eyJhbGciOi.example.sig"]],
    body: none,
  },
];
