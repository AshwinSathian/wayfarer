// D1.5: an empty app with the app's icon component, which ui-tree brings: subtracted from Material's size.
import { Component, provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { Icon } from "../../app/shared/icon/icon";
@Component({ selector: "app-root", imports: [Icon], template: `<app-icon name="chevron_right" />` })
class IconOnly {}
void bootstrapApplication(IconOnly, { providers: [provideZonelessChangeDetection()] });
