// D1.5: one candidate alone, for its bundle size.
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { AriaCandidate } from "../aria";
void bootstrapApplication(AriaCandidate, { providers: [provideZonelessChangeDetection()] });
