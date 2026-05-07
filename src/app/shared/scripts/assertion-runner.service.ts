import { Injectable } from "@angular/core";
import {
  AssertionOperator,
  AssertionTarget,
  TestAssertion,
  TestResult,
} from "../../models/test-assertion.models";

export interface AssertionResponseContext {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  durationMs?: number;
}

@Injectable({ providedIn: "root" })
export class AssertionRunnerService {
  run(
    assertions: TestAssertion[],
    response: AssertionResponseContext
  ): TestResult[] {
    return assertions.map((a) => this.evaluate(a, response));
  }

  private evaluate(
    assertion: TestAssertion,
    response: AssertionResponseContext
  ): TestResult {
    const label = this.buildLabel(assertion);
    try {
      const actual = this.resolveActual(assertion.target, assertion.key, response);
      const passed = this.applyOperator(assertion.operator, actual, assertion.expected);
      return {
        label,
        passed,
        actual,
        expected: assertion.expected,
        source: "assertion",
      };
    } catch (err) {
      return {
        label,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        source: "assertion",
      };
    }
  }

  private resolveActual(
    target: AssertionTarget,
    key: string | undefined,
    response: AssertionResponseContext
  ): unknown {
    switch (target) {
      case "status":
        return response.statusCode;
      case "duration":
        return response.durationMs ?? 0;
      case "header": {
        if (!key) {
          return undefined;
        }
        const lk = key.toLowerCase();
        const match = Object.entries(response.headers).find(
          ([k]) => k.toLowerCase() === lk
        );
        return match?.[1] ?? undefined;
      }
      case "body": {
        const parsed = this.parseBody(response.body);
        if (!key?.trim()) {
          return parsed;
        }
        return this.resolvePath(parsed, key);
      }
    }
  }

  private parseBody(body: unknown): unknown {
    if (body === undefined || body === null) {
      return null;
    }
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }
    return body;
  }

  private resolvePath(obj: unknown, path: string): unknown {
    const segments = path
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter(Boolean);
    let current: unknown = obj;
    for (const seg of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[seg];
    }
    return current;
  }

  private applyOperator(
    operator: AssertionOperator,
    actual: unknown,
    expected: string | undefined
  ): boolean {
    switch (operator) {
      case "equals":
        return this.coerce(actual) === this.coerce(expected);
      case "not-equals":
        return this.coerce(actual) !== this.coerce(expected);
      case "contains":
        return String(actual ?? "").includes(String(expected ?? ""));
      case "not-contains":
        return !String(actual ?? "").includes(String(expected ?? ""));
      case "exists":
        return actual !== undefined && actual !== null;
      case "not-exists":
        return actual === undefined || actual === null;
      case "is-array":
        return Array.isArray(actual);
      case "is-object":
        return (
          typeof actual === "object" && actual !== null && !Array.isArray(actual)
        );
      case "less-than": {
        const n = Number(expected);
        return typeof actual === "number" && actual < n;
      }
      case "greater-than": {
        const n = Number(expected);
        return typeof actual === "number" && actual > n;
      }
    }
  }

  /** Coerce both sides to the same primitive for equality checks. */
  private coerce(value: unknown): unknown {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === "string") {
      if (value === "true") return true;
      if (value === "false") return false;
      if (value === "null") return null;
      const n = Number(value);
      if (!isNaN(n) && value.trim() !== "") {
        return n;
      }
    }
    return value;
  }

  private buildLabel(assertion: TestAssertion): string {
    const targetLabel = this.targetLabel(assertion.target, assertion.key);
    const opLabel = this.operatorLabel(assertion.operator);
    const expectLabel =
      assertion.expected !== undefined && assertion.expected !== ""
        ? ` ${assertion.expected}`
        : "";
    return `${targetLabel} ${opLabel}${expectLabel}`;
  }

  private targetLabel(target: AssertionTarget, key?: string): string {
    switch (target) {
      case "status":
        return "Status code";
      case "duration":
        return "Duration (ms)";
      case "header":
        return key ? `Header "${key}"` : "Header";
      case "body":
        return key ? `Body.${key}` : "Body";
    }
  }

  private operatorLabel(op: AssertionOperator): string {
    const map: Record<AssertionOperator, string> = {
      equals: "equals",
      "not-equals": "does not equal",
      contains: "contains",
      "not-contains": "does not contain",
      exists: "exists",
      "not-exists": "does not exist",
      "is-array": "is an array",
      "is-object": "is an object",
      "less-than": "is less than",
      "greater-than": "is greater than",
    };
    return map[op] ?? op;
  }
}
