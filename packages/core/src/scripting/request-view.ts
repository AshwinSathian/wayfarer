import { graphqlText } from "../http/graphql";
import type { RequestContent } from "../model/request";
import type { ScriptBody, ScriptRequest } from "./host";

/**
 * A request as a script sees it in `pm.request`: the rows that are switched
 * on, `{{variables}}` as written. Of a multipart form or a file a script
 * sees the mode and no more: a file is the user's, and a script has no use
 * for its bytes.
 */
export function scriptRequestOf(content: RequestContent): ScriptRequest {
  const rows = (list: { key: string; value: string; enabled: boolean }[]) => list.filter((row) => row.enabled && row.key).map((row): [string, string] => [row.key, row.value]);
  const { body } = content;
  const seen: ScriptBody =
    body.mode === "raw" ? { mode: "raw", raw: body.raw?.text ?? "" } : body.mode === "graphql" ? { mode: "raw", raw: graphqlText(body.graphql?.query ?? "", body.graphql?.variables ?? "") } : body.mode === "urlencoded" ? { mode: "urlencoded", urlencoded: rows(body.urlencoded ?? []) } : { mode: body.mode };
  return { method: content.method, url: content.url, headers: rows(content.headers), body: seen };
}

/**
 * `content` as a pre-request script left it: its method, address, headers
 * and, where it is text or form fields, its body. This is what is sent; the
 * request the user composed is not changed.
 */
export function withScriptRequest(content: RequestContent, request: ScriptRequest): RequestContent {
  const rows = (pairs: [string, string][]) => pairs.map(([key, value]) => ({ key, value, enabled: true }));
  // A GraphQL body the script left as it saw it stays a GraphQL body: its variables are replaced before it is made JSON, not inside the JSON.
  const untouched = content.body.mode === "graphql" && request.body.mode === "raw" && request.body.raw === graphqlText(content.body.graphql?.query ?? "", content.body.graphql?.variables ?? "");
  const body = untouched
    ? content.body
    : request.body.mode === "raw"
      ? { ...content.body, mode: "raw" as const, raw: { language: content.body.mode === "graphql" ? ("json" as const) : (content.body.raw?.language ?? "text"), text: request.body.raw } }
      : request.body.mode === "urlencoded"
        ? { ...content.body, mode: "urlencoded" as const, urlencoded: rows(request.body.urlencoded) }
        : content.body;
  return { ...content, method: request.method, url: request.url, headers: rows(request.headers), body };
}

/**
 * The request as it went out, for a post-response script: the address and
 * headers as sent, variables replaced and the Auth tab's header among them.
 * A text body is the text that was sent, and form fields are read back from
 * it; of a multipart form or a file a script still sees the mode alone.
 * The caller masks vault secrets in `sent` first.
 */
export function sentScriptRequest(content: RequestContent, sent: Pick<ScriptRequest, "method" | "url" | "headers"> & { body?: string }): ScriptRequest {
  const { mode } = content.body;
  const body: ScriptBody =
    mode === "multipart" || mode === "binary"
      ? { mode }
      : sent.body === undefined
        ? { mode: "none" }
        : mode === "urlencoded"
          ? { mode, urlencoded: [...new URLSearchParams(sent.body)] }
          : { mode: "raw", raw: sent.body };
  return { method: sent.method, url: sent.url, headers: sent.headers, body };
}
