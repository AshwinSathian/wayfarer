import { describe, expect, it } from "vitest";
import { nextHop } from "./redirect";
import type { ResolvedRequest } from "./transport";

const post: ResolvedRequest = {
  method: "POST",
  url: "https://api.test/v1/start?x=1",
  headers: [["Authorization", "Bearer t"], ["cookie", "sid=1"], ["Content-Type", "text/plain"], ["X-Probe", "kept"]],
  body: "payload",
};
const hop = (request: ResolvedRequest, status: number, location: string | undefined, stayOnHost = false) => nextHop(request, status, location, stayOnHost);
const followed = (request: ResolvedRequest, status: number, location: string, stayOnHost = false) => {
  const next = hop(request, status, location, stayOnHost);
  if (!next || "stopped" in next) throw new Error(`not followed: ${JSON.stringify(next)}`);
  return next.request;
};

describe("nextHop (P5.4)", () => {
  it("is nothing for a response that is no redirect: another status, or no Location", () => {
    expect(hop(post, 200, "/next")).toBeUndefined();
    expect(hop(post, 304, "/next")).toBeUndefined();
    expect(hop(post, 300, "/next")).toBeUndefined();
    expect(hop(post, 302, undefined)).toBeUndefined();
  });

  it("reads Location against the address that answered", () => {
    expect(followed(post, 307, "/next").url).toBe("https://api.test/next");
    expect(followed(post, 307, "next?y=2").url).toBe("https://api.test/v1/next?y=2");
    expect(followed(post, 307, "//other.test/a").url).toBe("https://other.test/a");
    expect(followed(post, 307, "http://other.test:8080/a").url).toBe("http://other.test:8080/a");
  });

  it("301, 302 and 303 make a GET of a POST, without its body and the headers that described it; 307 and 308 repeat the request", () => {
    for (const status of [301, 302, 303]) {
      expect(followed(post, status, "/next"), String(status)).toEqual({ method: "GET", url: "https://api.test/next", headers: [["Authorization", "Bearer t"], ["cookie", "sid=1"], ["X-Probe", "kept"]] });
    }
    for (const status of [307, 308]) {
      expect(followed(post, status, "/next"), String(status)).toEqual({ ...post, url: "https://api.test/next" });
    }
  });

  it("303 makes a GET of every method but GET and HEAD; 301 and 302 leave a PUT a PUT", () => {
    const put = { ...post, method: "PUT" };
    expect(followed(put, 303, "/next").method).toBe("GET");
    expect(followed(put, 301, "/next")).toMatchObject({ method: "PUT", body: "payload" });
    expect(followed(put, 302, "/next")).toMatchObject({ method: "PUT", body: "payload" });
    expect(followed({ ...post, method: "HEAD", body: undefined }, 303, "/next").method).toBe("HEAD");
  });

  it("a hop to another origin goes without Authorization and Cookie; every other header goes along", () => {
    expect(followed(post, 307, "https://other.test/a").headers).toEqual([["Content-Type", "text/plain"], ["X-Probe", "kept"]]);
    expect(followed(post, 307, "https://api.test:8443/a").headers).toEqual([["Content-Type", "text/plain"], ["X-Probe", "kept"]]);
    expect(followed(post, 307, "https://api.test/a").headers).toEqual(post.headers);
  });

  it("a Location that is no http or https address is not followed", () => {
    expect(hop(post, 302, "file:///etc/passwd")).toEqual({ stopped: "location" });
    expect(hop(post, 302, "javascript:alert(1)")).toEqual({ stopped: "location" });
    expect(hop(post, 302, "http://")).toEqual({ stopped: "location" });
  });

  it("@claim:C-063 a request that is to stay on its host is not followed to another name or port, or to the same host without TLS", () => {
    expect(hop(post, 307, "https://other.test/a", true)).toEqual({ stopped: "other-host" });
    expect(hop(post, 307, "https://api.test:8443/a", true)).toEqual({ stopped: "other-host" });
    expect(hop(post, 307, "https://sub.api.test/a", true)).toEqual({ stopped: "other-host" });
    expect(hop(post, 307, "http://api.test/a", true)).toEqual({ stopped: "other-host" });
    // On its own host it is followed, and from http to https there too.
    expect(followed(post, 307, "/a", true).url).toBe("https://api.test/a");
    expect(followed(post, 307, "https://API.test/a", true).url).toBe("https://api.test/a");
    expect(followed({ ...post, url: "http://api.test/v1" }, 307, "https://api.test/a", true).url).toBe("https://api.test/a");
  });
});
