import { createCipheriv, randomBytes } from "node:crypto";
import { deflateRawSync } from "node:zlib";

/**
 * A link's fragment as `encodeShareLink` writes it (packages/core/src/share/link.ts), made here: the collection file
 * `deflate-raw`-compressed, sealed with AES-GCM-256 under a random key and IV, as base64url of IV ‖ ciphertext ‖ tag.
 */
export function shareFragmentOf(file: object, withCode = true): { hash: string; code: string } {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const sealed = Buffer.concat([
    iv,
    cipher.update(deflateRawSync(JSON.stringify(file))),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const code = key.toString("base64url");
  return { hash: `#share=${sealed.toString("base64url")}${withCode ? `&key=${code}` : ""}`, code };
}

/** A Wayfarer collection file of one request. */
export function collectionFile(ids: { collection: string; request: string }, name: string, url: string): object {
  const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
  return {
    $id: "wayfarer/collection",
    meta: meta("shared"),
    collection: {
      id: ids.collection,
      meta: meta(ids.collection),
      name,
      order: 0,
      variables: [],
      auth: { type: "none" },
      scripts: { pre: "", post: "" },
    },
    folders: [],
    requests: [
      {
        id: ids.request,
        meta: meta(ids.request),
        collectionId: ids.collection,
        name: "Shared request",
        order: 0,
        method: "GET",
        url,
        params: [],
        headers: [],
        body: { mode: "none" },
        auth: { type: "inherit" },
        scripts: { pre: "", post: "" },
        tests: [],
        settings: {},
      },
    ],
  };
}
