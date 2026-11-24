import { describe, expect, it } from "vitest";
import { tabTitle } from "./tab-state";

describe("tabTitle (audit 14)", () => {
  it("is the end of the path, not the start of the host", () => {
    expect(tabTitle("https://jsonplaceholder.typicode.com/todos/1")).toBe("todos/1");
    expect(tabTitle("https://api.example.com/v2/users/42/orders?page=2#top")).toBe("42/orders");
    expect(tabTitle("{{baseUrl}}/pets/{{id}}")).toBe("pets/{{id}}");
  });

  it("is the host when there is no path, and a path of one part is that part", () => {
    expect(tabTitle("https://api.example.com")).toBe("api.example.com");
    expect(tabTitle("https://api.example.com/")).toBe("api.example.com");
    expect(tabTitle("wss://echo.example.com/socket")).toBe("socket");
  });

  it("says that a request is new when nothing is typed, and keeps text that is not an address as it is", () => {
    expect(tabTitle("  ")).toBe("New request");
    expect(tabTitle("curl -X POST https://api.example.com/pets")).toBe("curl -X POST https://api.example.com/pets");
  });
});
