import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import type { SchemaOutline } from "../../shared/graphql/graphql-tools";

/** A GraphQL schema to look things up in (P5.5): each type, the root types first, with its fields and their arguments. */
@Component({
  selector: "app-graphql-explorer",
  template: `
    <section class="graphql-explorer rounded-xl border border-separator" aria-label="Schema">
      <p class="type-footnote text-label-secondary px-3 pt-2">Schema: {{ outline().types.length }} types</p>
      <ul class="m-0 list-none p-0">
        @for (type of outline().types; track type.name) {
          <li class="border-t border-separator first:border-t-0">
            <details [open]="type.root === 'query'">
              <summary class="cursor-pointer px-3 py-2 type-footnote">
                <span class="text-label-secondary">{{ type.root ?? type.kind }}</span>&ngsp;<span class="font-mono text-label-primary">{{ type.name }}</span>
              </summary>
              <div class="space-y-1 px-3 pb-3">
                @if (type.description) {
                  <p class="type-caption text-label-secondary">{{ type.description }}</p>
                }
                <ul class="m-0 list-none space-y-1 p-0">
                  @for (member of type.members; track member.name) {
                    <li class="min-w-0">
                      <code class="type-footnote break-all">{{ member.signature }}</code>
                      @if (member.description) {
                        <span class="type-caption text-label-secondary">&ngsp;{{ member.description }}</span>
                      }
                    </li>
                  }
                </ul>
              </div>
            </details>
          </li>
        }
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class GraphqlExplorer {
  readonly outline = input.required<SchemaOutline>();
}
