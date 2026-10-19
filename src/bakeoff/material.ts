import { ChangeDetectionStrategy, Component, afterNextRender, computed } from "@angular/core";
import { MatContextMenuTrigger, MatMenu, MatMenuContent, MatMenuItem } from "@angular/material/menu";
import { MatOption, MatSelect } from "@angular/material/select";
import { Tree, UiTreeNode } from "../app/ui/tree";
import { BakeNode, ENVIRONMENTS, METHOD_SHORT, markRendered } from "./model";
import { BakeState } from "./state";

/** Candidate 1: Angular Material, as the app uses it today (`ui-tree`, `mat-select`, `mat-menu`). */
@Component({
  selector: "bake-material, app-root",
  imports: [Tree, MatSelect, MatOption, MatMenu, MatMenuItem, MatMenuContent, MatContextMenuTrigger],
  template: `
    <div class="bake-field">
      <span id="env-label">Environment</span>
      <mat-select class="select w-48!" aria-labelledby="env-label" placeholder="No environment" [value]="state.env()" (selectionChange)="state.env.set($event.value)">
        <mat-option [value]="null">No environment</mat-option>
        @for (env of environments; track env.id) {
          <mat-option [value]="env.id">{{ env.name }}</mat-option>
        }
      </mat-select>
    </div>

    <ui-tree
      #tree
      ariaLabel="Collections"
      [nodes]="nodes()"
      [matContextMenuTriggerFor]="menu"
      [matContextMenuTriggerRestoreFocus]="false"
      (menuClosed)="tree.focusSelected()"
      (selected)="state.selected.set($event.key); state.target.set($event.data)"
      (opened)="state.open($event.node.data)"
      (reorder)="state.order($event.node.key, keysOf($event.siblings))"
    >
      <ng-template let-node>
        @if (node.data.method; as method) {
          <span class="bake-method">{{ short(method) }}</span>&ngsp;
        }
        {{ node.label }}
      </ng-template>
    </ui-tree>

    <mat-menu #menu="matMenu">
      <ng-template matMenuContent>
        @for (item of state.items(); track item) {
          <button mat-menu-item type="button" (click)="state.act(item)">{{ item }}</button>
        }
      </ng-template>
    </mat-menu>
    <p class="bake-log" data-testid="log">{{ state.log() }}</p>
    <p class="bake-log" data-testid="env">{{ state.env() ?? "none" }}</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialCandidate {
  protected readonly state = new BakeState();
  protected readonly environments = ENVIRONMENTS;

  protected readonly nodes = computed(() => this.state.nodes().map((node) => this.toUi(node)));

  constructor() {
    afterNextRender(() => markRendered(this.state.started));
  }

  protected short(method: string): string {
    return METHOD_SHORT[method] ?? method;
  }

  protected keysOf(nodes: UiTreeNode<BakeNode>[]): string[] {
    return nodes.map((node) => node.key);
  }

  private toUi(node: BakeNode): UiTreeNode<BakeNode> {
    return {
      key: node.key,
      label: node.label,
      ariaLabel: node.method ? `${this.short(node.method)} ${node.label}` : undefined,
      data: node,
      expanded: this.state.startsOpen(node),
      children: node.children?.map((child) => this.toUi(child)),
    };
  }
}
