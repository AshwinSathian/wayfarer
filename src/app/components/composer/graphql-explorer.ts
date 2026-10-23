import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import type { SchemaOutline } from "../../shared/graphql/graphql-tools";
import { Icon } from "../../shared/icon/icon";

/**
 * A GraphQL schema to look things up in (P5.5): each type, the root types first, with its fields and their
 * arguments. It is above the query, in a box of its own height, so a fetched schema is seen (U-046).
 */
@Component({
  selector: "app-graphql-explorer",
  imports: [Icon],
  template: `
    <section
      class="graphql-explorer max-h-60 overflow-y-auto rounded-xl border border-separator"
      aria-label="Schema"
      tabindex="0"
    >
      <p class="type-footnote text-label-secondary px-3 pt-2">Schema: {{ outline().types.length }} types</p>
      <ul class="m-0 list-none p-0">
        @for (type of outline().types; track type.name) {
          <li class="border-t border-separator first:border-t-0">
            <details [open]="type.root === 'query'">
              <summary class="flex cursor-pointer items-center gap-1 px-3 py-2 type-footnote">
                <app-icon name="chevron_right" class="explorer-chevron icon-xs text-label-tertiary" />
                <span class="text-label-secondary">{{ type.root ?? type.kind }}</span
                >&ngsp;<span class="font-mono text-label-primary">{{ type.name }}</span>
              </summary>
              <div class="space-y-1 px-3 pb-3">
                @if (type.description) {
                  <p class="type-footnote text-label-secondary">{{ type.description }}</p>
                }
                <ul class="m-0 list-none space-y-1 p-0">
                  @for (member of type.members; track member.name) {
                    <li class="min-w-0">
                      <code class="type-footnote break-all">{{ member.signature }}</code>
                      @if (member.description) {
                        <span class="type-footnote text-label-secondary">&ngsp;{{ member.description }}</span>
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
  // The browser's disclosure triangle is replaced by the app's chevron: nothing looks native.
  styles: `
    summary {
      list-style: none;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    .explorer-chevron {
      transition: transform var(--dur-quick) var(--ease-standard);
    }
    details[open] > summary .explorer-chevron {
      transform: rotate(90deg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class GraphqlExplorer {
  readonly outline = input.required<SchemaOutline>();
}
