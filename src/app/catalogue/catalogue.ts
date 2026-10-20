import { ChangeDetectionStrategy, Component, signal } from "@angular/core";
import { MenuTrigger } from "@angular/aria/menu";
import { Tab, TabContent, TabPanel, Tabs } from "@angular/aria/tabs";
import { MatButton } from "@angular/material/button";
import { UiMenu } from "../ui/menu";
import { UiMenuItem } from "../ui/menu-item";
import { UiTabList } from "../ui/tabs";
import { Tree, UiTreeNode } from "../ui/tree";

interface Row {
  method?: string;
}

const request = (key: string, label: string, method: string): UiTreeNode<Row> => ({ key, label, ariaLabel: `${method} ${label}`, data: { method } });

/**
 * Every widget of D3.3's layer, in each state a person can put it in, for the
 * axe scans and keyboard tests of `e2e/catalogue.spec.ts`. In development
 * builds only (`/app/?catalogue`, `src/main.ts`); the e2e serves
 * `npm run build:catalogue`. A family that moves off Material adds its widgets
 * here.
 */
@Component({
  // index.html's root element is the app's.
  selector: "app-root",
  imports: [MatButton, MenuTrigger, Tab, TabContent, TabPanel, Tabs, Tree, UiMenu, UiTabList],
  template: `
    <main class="catalogue">
      <h1 class="type-title-2">Widget catalogue</h1>

      <section aria-labelledby="catalogue-tree">
        <h2 id="catalogue-tree" class="type-title-3">Tree</h2>
        <p class="type-callout text-label-secondary">Open, closed and empty rows, three levels, and a request of each method.</p>
        <ui-tree #tree class="catalogue-tree" ariaLabel="Collections" [nodes]="nodes" [group]="kind" (selected)="row.set($event.label)" (contextmenu)="rowMenu.openAt($event, () => tree.focusSelected())">
          <ng-template let-node>
            @if (node.data.method; as method) {
              <span [class]="'method-tag method-' + method.toLowerCase()">{{ method }}</span>&ngsp;
            }
            <span class="type-body">{{ node.label }}</span>
          </ng-template>
        </ui-tree>
        <ui-menu #rowMenu [items]="rowItems" />
      </section>

      <section aria-labelledby="catalogue-menu">
        <h2 id="catalogue-menu" class="type-title-3">Menu</h2>
        <p class="type-callout text-label-secondary">A menu button with icons and a separator; a tree row's menu, by a right-click or Shift+F10.</p>
        <button matButton="outlined" class="btn-secondary" type="button" ngMenuTrigger #trigger="ngMenuTrigger" [menu]="menu.menu()">Export</button>
        <ui-menu #menu [trigger]="trigger" [items]="menuItems" />
        <p class="type-callout" role="status">{{ chosen() }}</p>
      </section>

      <section aria-labelledby="catalogue-tabs">
        <h2 id="catalogue-tabs" class="type-title-3">Tabs</h2>
        <p class="type-callout text-label-secondary">A request's parts, one with a count; a pane with a field, kept while another is shown.</p>
        <div ngTabs class="tabs">
          <div uiTabList aria-label="Request parts" [selectedTab]="part()" (selectedTabChange)="part.set($event)">
            <button ngTab type="button" value="params">Params</button>
            <button ngTab type="button" value="headers">Headers</button>
            <button ngTab type="button" value="body">Body</button>
            <button ngTab type="button" value="tests">Tests <span class="catalogue-count type-footnote tabular-nums">2</span></button>
          </div>
          <div class="tab-panes">
            <div ngTabPanel value="params" class="tab-pane" [preserveContent]="true"><ng-template ngTabContent><p class="type-callout">No parameters.</p></ng-template></div>
            <div ngTabPanel value="headers" class="tab-pane" [preserveContent]="true">
              <ng-template ngTabContent>
                <label for="catalogue-header" class="type-callout">Header name</label>
                <input id="catalogue-header" class="catalogue-input type-mono-body" />
              </ng-template>
            </div>
            <div ngTabPanel value="body" class="tab-pane" [preserveContent]="true"><ng-template ngTabContent><p class="type-callout">This request has no body.</p></ng-template></div>
            <div ngTabPanel value="tests" class="tab-pane" [preserveContent]="true"><ng-template ngTabContent><p class="type-callout">2 tests passed.</p></ng-template></div>
          </div>
        </div>
        <p class="type-callout text-label-secondary">The open requests, in a bar too narrow for them: it scrolls, and the open one is brought into it.</p>
        <div ngTabs class="catalogue-narrow">
          <div uiTabList class="request-tabs" aria-label="Open requests" [selectedTab]="request()" (selectedTabChange)="request.set($event)">
            @for (open of openRequests; track open.id) {
              <button ngTab type="button" [value]="open.id">
                <span class="request-tab-method">{{ open.method }}</span>
                <span class="request-tab-name">{{ open.name }}</span>
                @if (open.unsaved) {
                  <span class="request-tab-unsaved" role="img" aria-label="Unsaved changes"></span>
                }
              </button>
            }
          </div>
          @for (open of openRequests; track open.id) {
            <div ngTabPanel [value]="open.id" class="tab-pane" [preserveContent]="true"><ng-template ngTabContent><p class="type-callout">{{ open.name }}</p></ng-template></div>
          }
        </div>
        <button matButton="outlined" class="btn-secondary" type="button" (click)="request.set('r4')">Open the last request from code</button>
      </section>
    </main>
  `,
  styles: `
    .catalogue {
      display: grid;
      gap: 24px;
      max-width: 640px;
      padding: 24px 16px;
    }
    .catalogue-tree {
      display: block;
      max-width: 352px;
    }
    .catalogue-narrow {
      max-width: 240px;
    }
    .catalogue-count {
      margin-inline-start: 4px;
    }
    .catalogue-input {
      display: block;
      margin-top: 4px;
      padding: 4px 8px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--label-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Catalogue {
  protected readonly chosen = signal("Nothing chosen yet.");
  protected readonly row = signal("");
  protected readonly part = signal("headers");
  protected readonly request = signal("r1");
  protected readonly openRequests = [
    { id: "r1", method: "GET", name: "List users", unsaved: false },
    { id: "r2", method: "POST", name: "Create a refund", unsaved: true },
    { id: "r3", method: "PUT", name: "Replay an event", unsaved: false },
    { id: "r4", method: "DELETE", name: "Delete a customer", unsaved: false },
  ];
  protected readonly menuItems: UiMenuItem[] = [
    { label: "Copy as cURL", icon: "terminal", command: () => this.chosen.set("Chose Copy as cURL.") },
    { label: "Export as HAR…", icon: "download", command: () => this.chosen.set("Chose Export as HAR….") },
    { separator: true },
    { label: "Delete", icon: "delete", command: () => this.chosen.set("Chose Delete.") },
  ];
  protected readonly rowItems: UiMenuItem[] = [
    { label: "Rename", command: () => this.chosen.set(`Chose Rename for ${this.row()}.`) },
    { label: "Duplicate", command: () => this.chosen.set(`Chose Duplicate for ${this.row()}.`) },
  ];

  protected readonly kind = (node: UiTreeNode<Row>) => (node.data.method ? "request" : "folder");
  protected readonly nodes: UiTreeNode<Row>[] = [
    {
      key: "c1",
      label: "Payments API",
      data: {},
      expanded: true,
      children: [
        { key: "f1", label: "Refunds", data: {}, expanded: true, children: [request("r1", "Create a refund", "POST"), request("r2", "Refund by id", "GET")] },
        { key: "f2", label: "Webhooks", data: {}, children: [request("r3", "Replay an event", "PUT")] },
        { key: "f3", label: "Empty folder", data: {} },
        request("r4", "Delete a customer and every card, address and mandate on file", "DELETE"),
        request("r5", "Update a plan", "PATCH"),
        request("r6", "Ping", "HEAD"),
        request("r7", "What may be sent", "OPTIONS"),
      ],
    },
    { key: "c2", label: "A closed collection", data: {}, children: [request("r8", "List users", "GET")] },
  ];
}
