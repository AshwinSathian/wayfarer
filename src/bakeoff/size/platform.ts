// D1.5: one candidate alone, for its bundle size.
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { PlatformCandidate } from "../platform";
void bootstrapApplication(PlatformCandidate, { providers: [provideZonelessChangeDetection()] });
