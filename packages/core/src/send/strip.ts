import { isCurlCommand } from "../import/curl-command";
import { HTTP_METHODS, type Route } from "../model/request";
import { sent, strip } from "../strings";
import { formatDuration, type ExchangeRecord } from "./record";

/** What the route strip is told: the request as composed, and the last send's record when there is one. */
export interface StripInput {
  /** The route the request is sent by: its own, else its collection's, else the device's. */
  route: Route;
  /** A Local Bridge is paired: what `auto` may fall back to. */
  paired: boolean;
  /** A WebSocket's address is connected to by the page, never through a transport. */
  socket: boolean;
  method: string;
  /** The host as it would go, "" while there is none. */
  host: string;
  /** The vault secrets the request names, as written: names, never read, never counted from the vault. */
  secrets: readonly string[];
  /** Variables the request uses that are not vault secrets. */
  variables: number;
  /** The scripts that would run, and whether they wait for a review. */
  scripts: { count: number; held: boolean };
  /** The last send, when the request is still the one it was made from. */
  record?: ExchangeRecord | undefined;
}

/** What the strip draws, and the one string it is to a screen reader. */
export interface StripView {
  /** The first stop: where it will leave from, or where it left from. */
  route: string;
  /** The stop at the line's end. */
  host: string;
  method: string;
  /** The block on the line: secrets named before a send, or counted after one. "" for none. */
  secrets: string;
  /** What else the request has: variables and scripts. "" for none. */
  facts: string;
  /** After a send. */
  sent: boolean;
  /** After a send that got no response: the path is drawn broken, short of the host. A reply of any status is whole. */
  broken: boolean;
  /** The whole strip, as one sentence list. */
  text: string;
  /** The folded strip's one line of words: the route, the secrets and what else the request has, set apart by " · ". */
  line: string;
  /** The host is a real one: an address that is not one yet is drawn as words, not as a value. */
  hasHost: boolean;
}

const sentence = (parts: readonly string[]) =>
  parts
    .filter(Boolean)
    .map((part) => (/[.…]$/.test(part) ? part : `${part}.`))
    .join(" ");

/** The strip's content: before a send what it will do, after one what it did (the record's route and secrets). */
export function stripView(input: StripInput): StripView {
  const { record, scripts } = input;
  const facts = [
    input.variables ? strip.variables(input.variables) : "",
    scripts.count ? (scripts.held ? strip.scriptsHeld(scripts.count) : strip.scriptsTrusted(scripts.count)) : "",
  ]
    .filter(Boolean)
    .join(", ");
  const host = input.host || strip.noHost;
  let route: string;
  let secrets: string;
  if (record) {
    const viaBridge = record.route === "bridge";
    const afterNoAnswer = viaBridge && input.route === "auto";
    if (record.status) {
      route = viaBridge ? (afterNoAnswer ? sent.afterNoAnswer : sent.throughBridge) : sent.fromPage;
    } else {
      const kind = record.failure?.kind;
      const lead = kind === "timeout" ? sent.noAnswer : kind === "aborted" ? sent.stopped : sent.notDelivered;
      const tried = viaBridge
        ? afterNoAnswer
          ? sent.triedAfterNoAnswer
          : sent.triedThroughBridge
        : sent.triedFromPage;
      route = `${lead}: ${tried}`;
    }
    secrets = record.secrets.length ? sent.secrets(record.secrets.length) : "";
  } else {
    route =
      input.socket || input.route !== "bridge"
        ? input.route === "auto" && input.paired && !input.socket
          ? strip.autoWithBridge
          : strip.fromPage
        : strip.throughBridge;
    secrets = input.secrets.length ? strip.secrets(input.secrets) : "";
  }
  const outcome = record
    ? record.status
      ? [record.status.code, record.status.text].filter(Boolean).join(" ") +
        (record.durationMs > 0 ? `, ${formatDuration(record.durationMs)}` : "")
      : (record.failure?.summary ?? "No response")
    : "";
  return {
    route,
    host,
    method: input.method,
    secrets,
    facts,
    sent: !!record,
    broken: !!record && !record.status,
    text: sentence([route, outcome, input.host ? `${input.method} ${input.host}` : host, secrets, facts]),
    line: [route, secrets, facts].filter(Boolean).join(" · "),
    hasHost: !!input.host,
  };
}

/** What is wrong with the request before it is sent, said in the problem line. `null`: nothing. */
export interface AddressProblem {
  kind: "empty" | "missing" | "address";
  text: string;
  /** What the problem line offers to do about it: read the text as a cURL command, or as a method and an address. */
  offer?: { kind: "curl"; label: string } | { kind: "method"; label: string; method: string; address: string };
}

/** `GET https://host/path` typed into the address: a method, one space or more, and an address. */
const METHOD_AND_ADDRESS = /^\s*([A-Za-z]+)\s+((?:https?|wss?):\/\/\S+|\{\{\S*)\s*$/;

/** The offer for text typed or dropped into the address that is a command or a method and an address, not an address. */
function typedOffer(url: string): AddressProblem | null {
  if (isCurlCommand(url))
    return { kind: "address", text: strip.typedCurl, offer: { kind: "curl", label: strip.typedCurlAction } };
  const [, word = "", address = ""] = METHOD_AND_ADDRESS.exec(url) ?? [];
  const method = word.toUpperCase();
  if (!address || !(HTTP_METHODS as readonly string[]).includes(method)) return null;
  return {
    kind: "address",
    text: strip.typedMethodAndAddress(method, address),
    offer: { kind: "method", label: strip.typedMethodAction, method, address },
  };
}

/**
 * The problem line's text from whether the address is one a request can go to (`previewValid`) and the names of the variables that have no value. An empty address is a hint, not a fault.
 */
export function addressProblem(
  url: string,
  valid: boolean,
  missing: readonly string[],
  environment?: string,
): AddressProblem | null {
  if (!url.trim()) return { kind: "empty", text: strip.needsAddress };
  const typed = typedOffer(url);
  if (typed) return typed;
  const [first] = missing;
  if (first !== undefined)
    return {
      kind: "missing",
      text: environment ? strip.missingVariable(first, environment) : strip.missingVariableNoEnvironment(first),
    };
  return valid ? null : { kind: "address", text: strip.badAddress };
}
