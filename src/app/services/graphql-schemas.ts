import { Injectable, inject, signal } from "@angular/core";
import { loadMonaco } from "../shared/monaco/monaco-loader";
import type { GraphqlProblem, SchemaOutline } from "../shared/graphql/graphql-tools";
import { WorkspaceStore } from "../state/workspace-store";

/** What is known of the schema at one address. */
export interface SchemaState {
  status: "loading" | "ready" | "error";
  outline?: SchemaOutline;
  /** Why the last fetch gave no schema. */
  error?: string;
}

type Tools = typeof import("../shared/graphql/graphql-tools");
type Schema = ReturnType<Tools["schemaFrom"]>;

/**
 * The GraphQL schemas the app has asked servers for (P5.5), one for each
 * address, in the page's memory: a reload forgets them, and Fetch schema
 * asks again. A schema is asked for with the open tab's request, as Send
 * would send it, with the introspection query as its body.
 */
@Injectable({ providedIn: "root" })
export class GraphqlSchemas {
  private readonly store = inject(WorkspaceStore);

  private readonly states = signal<Record<string, SchemaState>>({});
  private readonly schemas = new Map<string, Schema>();
  /** What is wrong with the query in the editor, as it was last checked. */
  readonly problems = signal<GraphqlProblem[]>([]);
  private tools: Promise<Tools> | undefined;

  /** What is known of the schema at `url`: the address as it is written in the request. */
  stateOf(url: string): SchemaState | undefined {
    const states = this.states();
    return Object.hasOwn(states, url) ? states[url] : undefined;
  }

  /** The tools and the editor's GraphQL support, fetched once. */
  private load(): Promise<Tools> {
    this.tools ??= Promise.all([import("../shared/graphql/graphql-tools"), loadMonaco()]).then(([tools, monaco]) => {
      tools.attachGraphql(monaco, (problems) => this.problems.set(problems));
      return tools;
    });
    return this.tools;
  }

  /** Checks the open GraphQL query against the schema of `url`, when there is one, and for its syntax when there is none. */
  async use(url: string): Promise<void> {
    const tools = await this.load();
    tools.useSchema(this.schemas.get(url));
  }

  /** Asks the server at `url`, the open tab's address, for its schema. */
  async fetch(url: string): Promise<void> {
    const set = (state: SchemaState) => this.states.update((states) => ({ ...states, [url]: state }));
    const before = this.stateOf(url);
    set({ ...before, status: "loading" });
    try {
      const tools = await this.load();
      const schema = tools.schemaFrom(await this.store.introspect(tools.introspectionQuery()));
      this.schemas.set(url, schema);
      set({ status: "ready", outline: tools.outlineOf(schema) });
      tools.useSchema(schema);
    } catch (error) {
      // What had been fetched before stays: a server that is down for a moment takes no schema away.
      set({ ...before, status: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }
}
