import { ancestorsOf, type Ancestor, type CollectionExport } from "../model/collection";
import { normalizeUrl } from "../send/build";

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
 * An address with the variables the collection itself gives a value: a `{{baseUrl}}` of the collection would
 * otherwise hide the host it names. The innermost folder's value wins, as the resolver's does; a variable of the
 * receiver's environments is not known here and stays as written.
 */
function filled(address: string, chain: Ancestor[]): string {
  const values = new Map<string, string>();
  for (const { variables } of chain) for (const row of variables) if (row.enabled) values.set(row.key, row.value);
  let text = address;
  // ponytail: ten rounds of a value that names another; a deeper chain shows its last name as written.
  for (let round = 0; round < 10 && text.includes("{{"); round += 1) {
    const next = text.replace(/{{\s*([^{}]*?)\s*}}/g, (whole, name: string) => values.get(name) ?? whole);
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * An address's host as the browser will read it when it sends: `URL`'s, after the scheme the sender adds, so a `\`
 * or a user's name before an `@` cannot make it look like another host. An address whose host names a `{{variable}}`
 * has none until it is sent: it is shown as written, up to its path.
 */
function hostOf(address: string): string {
  const text = address.trim();
  if (!text) return "";
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i;
  const written = text.replace(scheme, "").split(/[/\\?#]/, 1)[0];
  if (written.includes("{{")) return written;
  // Each road's own rule: a `ws:` or `wss:` address is opened as written (`SocketClient`, P5.7); any other is sent
  // through `normalizeUrl`, which gives an address without `http:` or `https:` the `https://` it is sent with.
  return URL.parse(/^wss?:\/\//i.test(text) ? text : normalizeUrl(text))?.host ?? written;
}
