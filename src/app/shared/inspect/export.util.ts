const HAR_VERSION = "1.2";
const HAR_CREATOR = { name: "API Sandbox", version: "0" };
const MAX_INLINE_BODY = 256 * 1024; // 256 KB
const OMITTED_COMMENT = "omitted (size or type)";

export interface CurlExportContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

export function buildCurlCommand(context: CurlExportContext): string {
  const parts: string[] = ["curl"];

  if (context.method !== "GET") {
    parts.push(`-X ${context.method}`);
  }

  parts.push(`'${escapeSingleQuotes(context.url)}'`);

  for (const [key, value] of Object.entries(context.headers ?? {})) {
    if (!key) {
      continue;
    }
    parts.push(`-H '${escapeSingleQuotes(key)}: ${escapeSingleQuotes(value ?? "")}'`);
  }

  if (context.body !== undefined && context.body !== null) {
    let bodyStr: string;
    if (typeof context.body === "string") {
      bodyStr = context.body;
    } else {
      try {
        bodyStr = JSON.stringify(context.body);
      } catch {
        bodyStr = String(context.body);
      }
    }
    if (bodyStr) {
      parts.push(`-d '${escapeSingleQuotes(bodyStr)}'`);
    }
  }

  return parts.join(" \\\n  ");
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\\''");
}

export interface InspectorExportEntry {
  id: string;
  startedDateTime: string;
  time: number;
  req: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  res: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: unknown;
    sizes?: {
      transferSize?: number;
      encodedBodySize?: number;
      decodedBodySize?: number;
    };
  };
  phases?: {
    redirect?: number;
    dns?: number;
    tcp?: number;
    tls?: number;
    request?: number;
    ttfb?: number;
    content?: number;
  };
}

interface HarHeader {
  name: string;
  value: string;
}

interface HarQueryString {
  name: string;
  value: string;
}

interface HarPostData {
  mimeType: string;
  text?: string;
  comment?: string;
}

interface HarContent {
  size: number;
  mimeType: string;
  text?: string;
  comment?: string;
}

interface HarTimings {
  blocked: number;
  dns: number;
  connect: number;
  send: number;
  wait: number;
  receive: number;
  ssl: number;
}

interface HarRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: HarHeader[];
  queryString: HarQueryString[];
  headersSize: number;
  bodySize: number;
  postData?: HarPostData;
  comment?: string;
}

interface HarResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: HarHeader[];
  headersSize: number;
  bodySize: number;
  content: HarContent;
}

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  cache: Record<string, never>;
  timings: HarTimings;
}

export interface HarLog {
  log: {
    version: string;
    creator: typeof HAR_CREATOR;
    entries: HarEntry[];
  };
}

export function toHar(entry: InspectorExportEntry): HarLog {
  const requestHeaders = mapHeaders(entry.req.headers);
  const responseHeaders = mapHeaders(entry.res.headers);
  const requestMime = inferMimeType(entry.req.headers) ?? "application/json";
  const responseMime = inferMimeType(entry.res.headers) ?? "application/octet-stream";

  const requestPostData = extractJsonBody(entry.req.body);
  const responseContentData = extractJsonBody(entry.res.body);

  const request: HarRequest = {
    method: entry.req.method,
    url: entry.req.url,
    httpVersion: "HTTP/1.1",
    headers: requestHeaders,
    queryString: parseQueryParams(entry.req.url),
    headersSize: -1,
    bodySize: -1,
  };

  if (requestPostData?.text) {
    request.postData = {
      mimeType: requestMime,
      text: requestPostData.text,
    };
  } else if (requestPostData?.comment) {
    request.comment = requestPostData.comment;
  }

  const responseContent: HarContent = {
    size: entry.res.sizes?.encodedBodySize ?? -1,
    mimeType: responseMime,
  };

  if (responseContentData?.text) {
    responseContent.text = responseContentData.text;
  } else if (responseContentData?.comment) {
    responseContent.comment = responseContentData.comment;
  }

  const response: HarResponse = {
    status: entry.res.status,
    statusText: entry.res.statusText,
    httpVersion: "HTTP/1.1",
    headers: responseHeaders,
    headersSize: -1,
    bodySize: entry.res.sizes?.encodedBodySize ?? -1,
    content: responseContent,
  };

  const timings: HarTimings = {
    blocked: -1,
    dns: asTiming(entry.phases?.dns),
    connect: asTiming(entry.phases?.tcp),
    send: asTiming(entry.phases?.request),
    wait: asTiming(entry.phases?.ttfb),
    receive: asTiming(entry.phases?.content),
    ssl: asTiming(entry.phases?.tls),
  };

  const harEntry: HarEntry = {
    startedDateTime: entry.startedDateTime,
    time: entry.time,
    request,
    response,
    cache: {},
    timings,
  };

  return {
    log: {
      version: HAR_VERSION,
      creator: HAR_CREATOR,
      entries: [harEntry],
    },
  };
}

function mapHeaders(headers: Record<string, string>): HarHeader[] {
  return Object.entries(headers ?? {}).map(([name, value]) => ({
    name,
    value: value ?? "",
  }));
}

function parseQueryParams(url: string): HarQueryString[] {
  if (!url) {
    return [];
  }

  try {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    const parsed = new URL(url, base);
    const params: HarQueryString[] = [];
    parsed.searchParams.forEach((value, name) => {
      params.push({ name, value });
    });
    return params;
  } catch {
    const [, query = ""] = url.split("?");
    if (!query) {
      return [];
    }
    return query
      .split("&")
      .filter(Boolean)
      .map((segment) => {
        const [rawName, ...rest] = segment.split("=");
        const name = decodeURIComponent(rawName ?? "");
        const value = decodeURIComponent(rest.join("=") ?? "");
        return { name, value };
      });
  }
}

function inferMimeType(headers: Record<string, string>): string | undefined {
  const headerEntries = Object.entries(headers ?? {});
  for (const [name, value] of headerEntries) {
    if (name.toLowerCase() === "content-type") {
      return value;
    }
  }
  return undefined;
}

function extractJsonBody(
  body: unknown
): { text?: string; comment?: string } | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  let pretty: string | undefined;

  if (typeof body === "string") {
    if (!body.trim()) {
      return { comment: OMITTED_COMMENT };
    }
    try {
      const parsed = JSON.parse(body);
      pretty = JSON.stringify(parsed, null, 2);
    } catch {
      return { comment: OMITTED_COMMENT };
    }
  } else if (typeof body === "object") {
    try {
      pretty = JSON.stringify(body, null, 2);
    } catch {
      return { comment: OMITTED_COMMENT };
    }
  } else {
    return { comment: OMITTED_COMMENT };
  }

  if (pretty.length > MAX_INLINE_BODY) {
    return { comment: OMITTED_COMMENT };
  }

  return { text: pretty };
}

function asTiming(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return -1;
}

