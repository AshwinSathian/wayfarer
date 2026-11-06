import { describe, expect, it } from "vitest";
import type { CollectionExport } from "../model/collection";
import { emptyAuth } from "../model/request";
import { collectionHosts } from "./hosts";

const row = (key: string, value: string, enabled = true) => ({ key, value, enabled });
const holder = { name: "x", auth: { type: "none" }, variables: [], scripts: { pre: "", post: "" } };
function collection(urls: string[], oauth: { authUrl: string; tokenUrl: string }[] = []): CollectionExport {
  const auth = (at: number) => (oauth[at] ? { ...emptyAuth("oauth2"), ...oauth[at] } : { type: "none" });
  return {
    collection: { ...holder, auth: auth(0) },
    folders: [{ ...holder, meta: { id: "f1" }, auth: auth(1) }],
    requests: urls.map((url, at) => ({ url, auth: at === 0 ? auth(2) : { type: "none" } })),
  } as unknown as CollectionExport;
}

describe("collectionHosts", () => {
  it("names every host a collection's requests go to, once each, as the browser reads it", () => {
    expect(
      collectionHosts(
        collection([
          "https://api.shop.example.com/orders?page=1",
          "HTTPS://API.shop.example.com/orders/1",
          "http://user:pass@auth.shop.example.com:8443/token",
          "{{baseUrl}}/items",
          "cdn.example.net/assets#top",
          "wss://stream.example.com",
          "  ",
        ]),
      ),
    ).toEqual([
      "api.shop.example.com",
      "auth.shop.example.com:8443",
      "cdn.example.net",
      "stream.example.com",
      "{{baseUrl}}",
    ]);
  });

  it("is not fooled by a backslash or a user's name before an @", () => {
    expect(
      collectionHosts(
        collection([
          "https://evil.example\\@good.example/",
          "https://good.example@evil2.example/",
          "https://good.example%40x@evil3.example",
          "https://{{user}}@evil4.example/x",
          // Sent as https://ftp://good.example/: to the host "ftp", as the sender reads it.
          "ftp://good.example/",
        ]),
      ),
    ).toEqual(["evil.example", "evil2.example", "evil3.example", "ftp", "{{user}}@evil4.example"]);
  });

  it("names where OAuth 2.0 signs in and fetches its token, for the collection, a folder and a request", () => {
    expect(
      collectionHosts(
        collection(
          ["https://api.example.com/x"],
          [
            { authUrl: "https://login.example.com/authorize", tokenUrl: "https://token.example.com/t" },
            { authUrl: "", tokenUrl: "https://folder-token.example.com/t" },
            { authUrl: "", tokenUrl: "https://request-token.example.com/t" },
          ],
        ),
      ),
    ).toEqual([
      "api.example.com",
      "folder-token.example.com",
      "login.example.com",
      "request-token.example.com",
      "token.example.com",
    ]);
  });

  it("fills in the variables the collection gives a value, the innermost folder's winning", () => {
    const shared = {
      collection: {
        ...holder,
        variables: [row("baseUrl", "https://collection.example"), row("off", "https://off.example", false)],
      },
      folders: [
        {
          ...holder,
          meta: { id: "outer" },
          variables: [row("host", "{{deep}}"), row("deep", "https://outer.example")],
        },
        {
          ...holder,
          meta: { id: "inner" },
          parentFolderId: "outer",
          variables: [row("deep", "https://inner.example")],
        },
      ],
      requests: [
        { url: "{{baseUrl}}/a", auth: { type: "none" } },
        { url: "{{ host }}/b", folderId: "inner", auth: { type: "none" } },
        { url: "{{host}}/c", folderId: "outer", auth: { type: "none" } },
        { url: "{{off}}/d", auth: { type: "none" } },
        { url: "{{env}}/e", auth: { type: "none" } },
      ],
    } as unknown as CollectionExport;
    expect(collectionHosts(shared)).toEqual([
      "collection.example",
      "inner.example",
      "outer.example",
      "{{env}}",
      "{{off}}",
    ]);
  });

  it("reads a socket address without its slashes as the browser's WebSocket does", () => {
    const sockets = {
      collection: { ...holder, variables: [row("h", "evil4.example")] },
      folders: [],
      requests: ["ws:\\\\evil1.example/x", "wss:/evil2.example", "ws:evil3.example", "ws:{{h}}/x", "ws:{{env}}/y"].map(
        (url) => ({ url, auth: { type: "none" } }),
      ),
    } as unknown as CollectionExport;
    expect(collectionHosts(sockets)).toEqual([
      "evil1.example",
      "evil2.example",
      "evil3.example",
      "evil4.example",
      "{{env}}",
    ]);
  });
});
