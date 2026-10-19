// D1.5: one candidate alone, for its bundle size.
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { Component } from "@angular/core";
@Component({ selector: "app-root", template: "" })
class Empty {}
void bootstrapApplication(Empty, { providers: [provideZonelessChangeDetection()] });
