import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { ApplicationConfig } from "@angular/core";
import { provideAnimations } from "@angular/platform-browser/animations";
import { definePreset } from "@primeng/themes";
import Aura from "@primeng/themes/aura";
import { providePrimeNG } from "primeng/config";

const SandboxTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50:  "{indigo.50}",
      100: "{indigo.100}",
      200: "{indigo.200}",
      300: "{indigo.300}",
      400: "{indigo.400}",
      500: "{indigo.500}",
      600: "{indigo.600}",
      700: "{indigo.700}",
      800: "{indigo.800}",
      900: "{indigo.900}",
      950: "{indigo.950}",
    },
    colorScheme: {
      dark: {
        surface: {
          0:   "#0b0c10",
          50:  "#0f1118",
          100: "#141720",
          200: "#1a1d28",
          300: "#1f2333",
          400: "#252840",
          500: "#2e3350",
          600: "#3a3f60",
          700: "#474d70",
          800: "#6b7280",
          900: "#9ca3af",
          950: "#e6e8f0",
        },
        primary: {
          color:       "{indigo.400}",
          contrastColor: "#ffffff",
          hoverColor:  "{indigo.300}",
          activeColor: "{indigo.200}",
        },
        highlight: {
          background:      "rgba(99, 102, 241, 0.15)",
          focusBackground: "rgba(99, 102, 241, 0.25)",
          color:           "#a5b4fc",
          focusColor:      "#c7d2fe",
        },
      },
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideAnimations(),
    providePrimeNG({
      ripple: true,
      theme: {
        preset: SandboxTheme,
        options: {
          darkModeSelector: '[data-theme="dark"]',
        },
      },
    }),
    // Reserved for future PWA integration:
    // import { provideServiceWorker } from '@angular/service-worker';
    // provideServiceWorker('ngsw-worker.js', { enabled: true }),
  ],
};
