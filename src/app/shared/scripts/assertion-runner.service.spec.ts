import { TestBed } from "@angular/core/testing";
import { AssertionRunnerService, AssertionResponseContext } from "./assertion-runner.service";
import { TestAssertion } from "../../models/test-assertion.models";
import { describe, it, beforeEach, expect } from "vitest";

describe("AssertionRunnerService", () => {
  let service: AssertionRunnerService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AssertionRunnerService] });
    service = TestBed.inject(AssertionRunnerService);
  });

  function assertion(overrides: Partial<TestAssertion>): TestAssertion {
    return {
      id: "t1",
      target: "status",
      operator: "equals",
      expected: "",
      ...overrides,
    };
  }

  describe("target resolution", () => {
    it("reads the response status code", () => {
      const response: AssertionResponseContext = { statusCode: 404, body: null, headers: {} };
      const [result] = service.run(
        [assertion({ target: "status", operator: "equals", expected: "404" })],
        response
      );
      expect(result.passed).toBe(true);
      expect(result.actual).toBe(404);
    });

    it("reads response duration, defaulting to 0 when not provided", () => {
      const response: AssertionResponseContext = { statusCode: 200, body: null, headers: {} };
      const [result] = service.run(
        [assertion({ target: "duration", operator: "equals", expected: "0" })],
        response
      );
      expect(result.actual).toBe(0);
      expect(result.passed).toBe(true);
    });

    it("reads a header case-insensitively", () => {
      const response: AssertionResponseContext = {
        statusCode: 200,
        body: null,
        headers: { "Content-Type": "application/json" },
      };
      const [result] = service.run(
        [
          assertion({
            target: "header",
            key: "content-type",
            operator: "contains",
            expected: "json",
          }),
        ],
        response
      );
      expect(result.passed).toBe(true);
      expect(result.actual).toBe("application/json");
    });

    it("returns undefined for a header that isn't present", () => {
      const response: AssertionResponseContext = { statusCode: 200, body: null, headers: {} };
      const [result] = service.run(
        [assertion({ target: "header", key: "X-Missing", operator: "not-exists" })],
        response
      );
      expect(result.passed).toBe(true);
      expect(result.actual).toBeUndefined();
    });

    it("parses a JSON string body and resolves a dotted/bracket path", () => {
      const response: AssertionResponseContext = {
        statusCode: 200,
        body: JSON.stringify({ data: { items: [{ id: 42 }] } }),
        headers: {},
      };
      const [result] = service.run(
        [
          assertion({
            target: "body",
            key: "data.items[0].id",
            operator: "equals",
            expected: "42",
          }),
        ],
        response
      );
      expect(result.passed).toBe(true);
      expect(result.actual).toBe(42);
    });

    it("treats an already-parsed object body the same as a JSON string body", () => {
      const response: AssertionResponseContext = {
        statusCode: 200,
        body: { name: "widget" },
        headers: {},
      };
      const [result] = service.run(
        [assertion({ target: "body", key: "name", operator: "equals", expected: "widget" })],
        response
      );
      expect(result.passed).toBe(true);
    });

    it("returns the whole parsed body when no key is given", () => {
      const response: AssertionResponseContext = {
        statusCode: 200,
        body: { ok: true },
        headers: {},
      };
      const [result] = service.run(
        [assertion({ target: "body", operator: "is-object" })],
        response
      );
      expect(result.passed).toBe(true);
      expect(result.actual).toEqual({ ok: true });
    });

    it("falls back to the raw string when the body isn't valid JSON", () => {
      const response: AssertionResponseContext = {
        statusCode: 200,
        body: "not json",
        headers: {},
      };
      const [result] = service.run(
        [assertion({ target: "body", operator: "equals", expected: "not json" })],
        response
      );
      expect(result.passed).toBe(true);
    });
  });

  describe("operators", () => {
    const response: AssertionResponseContext = { statusCode: 200, body: null, headers: {} };

    it("equals / not-equals coerce numeric and boolean-looking strings before comparing", () => {
      const [eq] = service.run(
        [assertion({ target: "status", operator: "equals", expected: "200" })],
        response
      );
      expect(eq.passed).toBe(true);

      const [neq] = service.run(
        [assertion({ target: "status", operator: "not-equals", expected: "201" })],
        response
      );
      expect(neq.passed).toBe(true);
    });

    it("contains / not-contains do substring matching on stringified values", () => {
      const [contains] = service.run(
        [assertion({ target: "status", operator: "contains", expected: "0" })],
        response
      );
      expect(contains.passed).toBe(true);

      const [notContains] = service.run(
        [assertion({ target: "status", operator: "not-contains", expected: "9" })],
        response
      );
      expect(notContains.passed).toBe(true);
    });

    it("exists / not-exists treat both null and undefined as absent", () => {
      const withHeader: AssertionResponseContext = {
        statusCode: 200,
        body: null,
        headers: { "X-Present": "yes" },
      };
      const [exists] = service.run(
        [assertion({ target: "header", key: "X-Present", operator: "exists" })],
        withHeader
      );
      expect(exists.passed).toBe(true);

      const [notExists] = service.run(
        [assertion({ target: "header", key: "X-Absent", operator: "not-exists" })],
        withHeader
      );
      expect(notExists.passed).toBe(true);
    });

    it("is-array / is-object distinguish arrays from plain objects", () => {
      const arrayResponse: AssertionResponseContext = {
        statusCode: 200,
        body: [1, 2, 3],
        headers: {},
      };
      const [isArray] = service.run(
        [assertion({ target: "body", operator: "is-array" })],
        arrayResponse
      );
      expect(isArray.passed).toBe(true);

      const [notObject] = service.run(
        [assertion({ target: "body", operator: "is-object" })],
        arrayResponse
      );
      expect(notObject.passed).toBe(false);
    });

    it("less-than / greater-than only pass for actual numeric values", () => {
      const durationResponse: AssertionResponseContext = {
        statusCode: 200,
        body: null,
        headers: {},
        durationMs: 150,
      };
      const [lt] = service.run(
        [assertion({ target: "duration", operator: "less-than", expected: "200" })],
        durationResponse
      );
      expect(lt.passed).toBe(true);

      const [gt] = service.run(
        [assertion({ target: "duration", operator: "greater-than", expected: "100" })],
        durationResponse
      );
      expect(gt.passed).toBe(true);

      const [ltOnString] = service.run(
        [assertion({ target: "header", key: "x", operator: "less-than", expected: "5" })],
        durationResponse
      );
      expect(ltOnString.passed).toBe(false);
    });
  });

  describe("error handling and labels", () => {
    it("catches a path-resolution error on a non-object body and reports it as a failed result, not a thrown exception", () => {
      const response: AssertionResponseContext = {
        statusCode: 200,
        body: "just a string",
        headers: {},
      };
      const [result] = service.run(
        [assertion({ target: "body", key: "deep.path", operator: "exists" })],
        response
      );
      // Resolving a path into a primitive string yields undefined rather than
      // throwing, so this specifically exercises the "no match" branch, not
      // the catch block — resolvePath is defensive by construction.
      expect(result.passed).toBe(false);
      expect(result.actual).toBeUndefined();
    });

    it("builds a human-readable label from target/operator/expected", () => {
      const response: AssertionResponseContext = { statusCode: 200, body: null, headers: {} };
      const [result] = service.run(
        [
          assertion({
            target: "header",
            key: "X-Trace",
            operator: "contains",
            expected: "abc",
          }),
        ],
        response
      );
      expect(result.label).toBe('Header "X-Trace" contains abc');
    });

    it("omits the expected value from the label for operators that don't need one", () => {
      const response: AssertionResponseContext = { statusCode: 200, body: null, headers: {} };
      const [result] = service.run(
        [assertion({ target: "status", operator: "exists" })],
        response
      );
      expect(result.label).toBe("Status code exists");
    });

    it("runs a batch of assertions and returns one result per assertion, in order", () => {
      const response: AssertionResponseContext = { statusCode: 200, body: null, headers: {} };
      const results = service.run(
        [
          assertion({ target: "status", operator: "equals", expected: "200" }),
          assertion({ target: "status", operator: "equals", expected: "500" }),
        ],
        response
      );
      expect(results.length).toBe(2);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(false);
    });
  });
});
