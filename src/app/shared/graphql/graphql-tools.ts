import {
  buildClientSchema,
  getIntrospectionQuery,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isUnionType,
  type GraphQLSchema,
  type IntrospectionQuery,
} from "graphql";
import { Position, getAutocompleteSuggestions, getDiagnostics } from "graphql-language-service";
import type { MonacoEditorModule } from "../monaco/monaco-loader";

/**
 * What the app does with a GraphQL schema (P5.5): reads an introspection
 * answer, lists it, and gives the query editor completion and validation.
 * `graphql` and `graphql-language-service` are in this file only, and this
 * file is fetched by a dynamic `import()` when a schema is first asked for:
 * neither is in the first bundle.
 *
 * It runs in the page, not in a worker: a schema is checked against a query
 * of a few lines, 300 ms after the last key.
 */

/** A schema as the explorer lists it: the types a person writes queries against, the root types first. */
export interface SchemaOutline {
  types: {
    name: string;
    kind: string;
    root?: "query" | "mutation" | "subscription";
    description?: string;
    members: { name: string; signature: string; description?: string }[];
  }[];
}

/** A place in a query where something is wrong, by line and column from 1. */
export interface GraphqlProblem {
  message: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

/** The query that asks a server for its schema. */
export const introspectionQuery = (): string => getIntrospectionQuery();

/** The schema of an introspection answer (`{ "data": { "__schema": … } }`, as text). Throws with a sentence when the text is not one. */
export function schemaFrom(answer: string): GraphQLSchema {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error("The server's answer is not JSON.", { cause: error });
  }
  const data = (parsed as { data?: unknown } | null)?.data;
  if (typeof data !== "object" || data === null || !("__schema" in data)) {
    const errors = (parsed as { errors?: { message?: unknown }[] } | null)?.errors;
    const said =
      Array.isArray(errors) && typeof errors[0]?.message === "string" ? ` The server says: ${errors[0].message}` : "";
    throw new Error(`The server's answer holds no schema: it may not allow introspection.${said}`);
  }
  // Throws a GraphQLError with its own sentence when the answer is not a schema.
  return buildClientSchema(data as IntrospectionQuery);
}

export function outlineOf(schema: GraphQLSchema): SchemaOutline {
  const roots = new Map([
    [schema.getQueryType()?.name, "query" as const],
    [schema.getMutationType()?.name, "mutation" as const],
    [schema.getSubscriptionType()?.name, "subscription" as const],
  ]);
  const types = Object.values(schema.getTypeMap())
    .filter((type) => !type.name.startsWith("__"))
    .flatMap((type): SchemaOutline["types"] => {
      const head = {
        name: type.name,
        ...(roots.get(type.name) && { root: roots.get(type.name) }),
        ...(type.description && { description: type.description }),
      };
      if (isObjectType(type) || isInterfaceType(type)) {
        const members = Object.values(type.getFields()).map((field) => ({
          name: field.name,
          signature: `${field.name}${field.args.length ? `(${field.args.map((arg) => `${arg.name}: ${String(arg.type)}`).join(", ")})` : ""}: ${String(field.type)}`,
          ...(field.description && { description: field.description }),
        }));
        return [{ ...head, kind: isObjectType(type) ? "type" : "interface", members }];
      }
      if (isInputObjectType(type))
        return [
          {
            ...head,
            kind: "input",
            members: Object.values(type.getFields()).map((field) => ({
              name: field.name,
              signature: `${field.name}: ${String(field.type)}`,
              ...(field.description && { description: field.description }),
            })),
          },
        ];
      if (isEnumType(type))
        return [
          {
            ...head,
            kind: "enum",
            members: type.getValues().map((value) => ({
              name: value.name,
              signature: value.name,
              ...(value.description && { description: value.description }),
            })),
          },
        ];
      if (isUnionType(type))
        return [
          {
            ...head,
            kind: "union",
            members: type.getTypes().map((member) => ({ name: member.name, signature: member.name })),
          },
        ];
      // The built-in scalars are not listed: nobody looks up String.
      return ["String", "Int", "Float", "Boolean", "ID"].includes(type.name)
        ? []
        : [{ ...head, kind: "scalar", members: [] }];
    });
  const rank = (type: SchemaOutline["types"][number]) =>
    type.root ? ["query", "mutation", "subscription"].indexOf(type.root) : 3;
  return { types: types.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)) };
}

/** What is wrong with `query`: its syntax, and against `schema` when there is one. */
export function problemsOf(query: string, schema?: GraphQLSchema): GraphqlProblem[] {
  if (!query.trim()) return [];
  return getDiagnostics(query, schema).map((found) => ({
    message: typeof found.message === "string" ? found.message : found.message.value,
    line: found.range.start.line + 1,
    column: found.range.start.character + 1,
    endLine: found.range.end.line + 1,
    endColumn: found.range.end.character + 1,
  }));
}

/** What may be written at `line` and `column` (from 1) of `query`. */
export function completionsAt(
  query: string,
  line: number,
  column: number,
  schema: GraphQLSchema,
): { label: string; detail?: string; documentation?: string }[] {
  return getAutocompleteSuggestions(schema, query, new Position(line - 1, column - 1)).map((item) => ({
    label: item.label,
    ...(item.detail && { detail: item.detail }),
    ...(typeof item.documentation === "string" && item.documentation && { documentation: item.documentation }),
  }));
}

let schemaInUse: GraphQLSchema | undefined;
let attached: MonacoEditorModule | undefined;
let report: (problems: GraphqlProblem[]) => void = () => undefined;
const timers = new WeakMap<object, ReturnType<typeof setTimeout>>();

function check(monaco: MonacoEditorModule, model: ReturnType<MonacoEditorModule["editor"]["getModels"]>[number]): void {
  if (model.isDisposed() || model.getLanguageId() !== "graphql") return;
  const problems = problemsOf(model.getValue(), schemaInUse);
  monaco.editor.setModelMarkers(
    model,
    "graphql",
    problems.map((problem) => ({
      message: problem.message,
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: problem.line,
      startColumn: problem.column,
      endLineNumber: problem.endLine,
      endColumn: problem.endColumn,
    })),
  );
  report(problems);
}

/**
 * Gives every GraphQL editor completion and validation against the schema
 * in use, once. `onProblems` is told what is wrong with the query each
 * time it was checked.
 */
export function attachGraphql(monaco: MonacoEditorModule, onProblems: (problems: GraphqlProblem[]) => void): void {
  report = onProblems;
  if (attached) return;
  attached = monaco;
  const watch = (model: ReturnType<MonacoEditorModule["editor"]["getModels"]>[number]) => {
    model.onDidChangeContent(() => {
      clearTimeout(timers.get(model));
      timers.set(
        model,
        setTimeout(() => check(monaco, model), 300),
      );
    });
    check(monaco, model);
  };
  monaco.editor.getModels().forEach(watch);
  monaco.editor.onDidCreateModel(watch);
  monaco.editor.onDidChangeModelLanguage(({ model }) => check(monaco, model));
  monaco.languages.registerCompletionItemProvider("graphql", {
    triggerCharacters: ["{", "(", ":", "$", "@", " ", "\n"],
    provideCompletionItems: (model, position) => {
      if (!schemaInUse) return { suggestions: [] };
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: completionsAt(model.getValue(), position.lineNumber, position.column, schemaInUse).map((item) => ({
          label: item.label,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: item.label,
          range,
          ...(item.detail && { detail: item.detail }),
          ...(item.documentation && { documentation: item.documentation }),
        })),
      };
    },
  });
}

/** The schema queries are checked against from now on, or none: every open GraphQL editor is checked again. */
export function useSchema(schema: GraphQLSchema | undefined): void {
  schemaInUse = schema;
  if (attached) for (const model of attached.editor.getModels()) check(attached, model);
}
