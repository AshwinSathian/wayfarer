import { parseJson } from "../safe-json";

/**
 * The body a GraphQL request is sent with (P5.5): one JSON object with the
 * query as text and the variables as the object they are. `variables` is
 * the text of the variables pane; empty, the payload names none.
 */
export function graphqlPayload(query: string, variables: string): { text: string } | { error: string } {
  if (!variables.trim()) return { text: JSON.stringify({ query }) };
  const parsed = parseJson(variables);
  if (!parsed.ok) return { error: "The GraphQL variables are not JSON." };
  if (typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) return { error: "The GraphQL variables must be a JSON object." };
  return { text: JSON.stringify({ query, variables: parsed.value }) };
}

/** The payload as text whatever its variables are: for a view of the request (a script's, an export's), where a send would refuse. */
export function graphqlText(query: string, variables: string): string {
  const payload = graphqlPayload(query, variables);
  return "text" in payload ? payload.text : JSON.stringify({ query, variables });
}
