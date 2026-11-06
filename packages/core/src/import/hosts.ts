import { ancestorsOf, type Ancestor, type CollectionExport } from "../model/collection";
import { normalizeUrl } from "../send/build";
import { VariableNestingError, VariableResolver } from "../variables/resolver";

/**
 * The hosts a collection sends to, for the import report (T1.3, `receive.md`): a receiver should know where a
 * collection sends before they send from it. Each request's address, and the sign-in and token addresses of every
 * OAuth 2.0 auth (the collection's, a folder's, a request's). A script's `pm.sendRequest` is not read: scripts arrive
 * held, and their review shows them.
 */
export function collectionHosts({ collection, folders, requests }: CollectionExport): string[] {
  const chain = (folderId: string | undefined) => ancestorsOf(collection, folders, folderId);
  const addresses = [
    ...requests.map((request) => filled(request.url, chain(request.folderId))),
    ...[
      { auth: collection.auth, chain: chain(undefined) },
      ...folders.map((folder) => ({ auth: folder.auth, chain: chain(folder.meta.id) })),
      ...requests.map((request) => ({ auth: request.auth, chain: chain(request.folderId) })),
    ].flatMap(({ auth, chain }) =>
      auth.type === "oauth2" ? [filled(auth.authUrl, chain), filled(auth.tokenUrl, chain)] : [],
    ),
  ];
  return [...new Set(addresses.map(hostOf).filter(Boolean))].sort();
}

/**
 * An address with the variables the collection itself gives a value, through the resolver a send uses: a
 * `{{baseUrl}}` of the collection would otherwise hide the host it names. A variable of the receiver's environments is
 * not known here and stays as written; so does an address whose variables nest too deep.
 */
function filled(address: string, chain: Ancestor[]): string {
  const [collection, ...folders] = chain;
  // The outermost folder's rows first: a later row wins, so the nearest folder does (as `WorkspaceStore` stacks them).
  const resolver = new VariableResolver({
    collection: collection.variables,
    folder: folders.flatMap((folder) => folder.variables),
  });
  try {
    return resolver.resolve(address);
  } catch (error) {
    if (!(error instanceof VariableNestingError)) throw error;
    return address;
  }
}

/**
 * An address's host as the browser will read it when it sends: `URL`'s, after the scheme the sender adds, so a `\`
 * or a user's name before an `@` cannot make it look like another host. An address whose host names a `{{variable}}`
 * has none until it is sent: it is shown as written, up to its path.
 */
function hostOf(address: string): string {
  const text = address.trim();
  if (!text) return "";
  // Each road's own rule: an address that starts `ws:` or `wss:` is opened as written (`SocketClient`, P5.7), and
  // `WebSocket` reads `ws:host` and `ws:\host` as `ws://host`; any other is sent through `normalizeUrl`, which gives an
  // address without `http:` or `https:` the `https://` it is sent with.
  const socket = /^wss?:/i.test(text);
  const scheme = socket ? /^wss?:[/\\]*/i : /^[a-z][a-z0-9+.-]*:\/\//i;
  const written = text.replace(scheme, "").split(/[/\\?#]/, 1)[0];
  if (written.includes("{{")) return written;
  return URL.parse(socket ? text : normalizeUrl(text))?.host ?? written;
}
