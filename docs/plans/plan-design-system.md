# Plan: Design System Overhaul
> **Destroy this file after implementation is complete.**

---

## 1. Diagnosis — What's Broken Today

| Problem | Location | Impact |
|---|---|---|
| Background colors are raw hex literals (`#0b0f19`, `#0f1524`, `bg-black/80`) scattered across 12+ files | Every component | Can't update theme without mass find-replace |
| Method colors are hardcoded hex strings inside Tailwind arbitrary value brackets (`text-[#61affe]`) | `past-requests.component.html` | Not themeable; easy to drift out of sync |
| The "ALL CAPS + TRACKING-WIDEST + TEXT-SLATE-400" pattern is applied to every label, every divider, every section header | Every component | Creates visual noise; nothing is actually emphasised because everything is |
| PrimeNG Material Purple preset is the stock generic purple — visually unremarkable | `app.config.ts` | Reads as "default PrimeNG app" not as a considered product |
| `::ng-deep` hacks in component CSS to override PrimeNG styles | `app-shell.component.css`, `environments-manager.component.css` | Fragile; breaks silently on PrimeNG upgrades |
| No light mode | `styles.css` — `color-scheme: dark` hardcoded | Excludes users; inaccessible in bright environments |
| Typography is unsystematic — sizes and weights are picked per-instance via Tailwind | All templates | No hierarchy; every designer iteration is inconsistent |
| Spacing is ad-hoc — margins and padding values are chosen individually, not from a grid | All templates | Inconsistent rhythm; hard to make sweeping layout changes |
| `p-card` wraps the request form — adds Material shadow box chrome that fights the dark canvas | `api-params.component.html` | Visual heaviness; the card chrome competes with content |
| PrimeNG Material tab underlines — horizontal lines fight the already-noisy layout | Response viewer, API params, Environments | Looks like default Material, not considered |

---

## 2. Design Philosophy

Draw from Apple's HIG (Human Interface Guidelines) for three core principles:

- **Clarity**: Every pixel earns its place. Remove labels that repeat what the content already says. Silence uppercase-everything. Reserve emphasis for things that are actually important.
- **Deference**: The UI should step back so the user's content — the API response, the URL, the JSON body — is the hero. Reduce component chrome. More whitespace, not less.
- **Depth**: Hierarchy through translucency and layering (backdrop-filter blur, subtle fills), not heavy shadows or thick borders.

---

## 3. Font Stack

Replace **Open Sans** with **Inter** for UI text and **JetBrains Mono** for all code-adjacent surfaces (URLs, method names, JSON keys, response body).

**Why Inter**: It was designed for screen display, has optical-size-aware metrics, and reads more like SF Pro than Open Sans. It is purpose-built for developer tools and data-dense UIs.

**Why JetBrains Mono**: Current code/URL rendering uses Open Sans with `font-mono` Tailwind class (which falls back to system monospace). JetBrains Mono has wider character shapes optimised for legibility at small sizes, clear disambiguation between 0/O and l/1/I, and minimal visual noise in JSON structures.

### Google Fonts import (replace in `styles.css`):
```css
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap");
@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap");
```

### Type Scale (all sizes in px, line heights in px)

| Token | Size | Line Height | Weight | Usage |
|---|---|---|---|---|
| `--type-display` | 26px | 32px | 600 | Page title, empty state heroes |
| `--type-title-1` | 20px | 26px | 600 | Panel headers, dialog titles |
| `--type-title-2` | 17px | 22px | 600 | Section headers, card titles |
| `--type-title-3` | 15px | 20px | 600 | Sub-section headers |
| `--type-headline` | 14px | 20px | 500 | Emphasised body, form labels |
| `--type-body` | 14px | 20px | 400 | Default UI text |
| `--type-callout` | 13px | 18px | 400 | Descriptions, secondary info |
| `--type-subhead` | 12px | 16px | 500 | Metadata labels, list secondary text |
| `--type-footnote` | 11px | 15px | 400 | Timestamps, badge text |
| `--type-caption` | 10px | 14px | 400 | Tooltips, very fine details |
| `--type-mono-body` | 13px | 20px | 400 | URLs, request names in history, JSON |
| `--type-mono-label` | 12px | 16px | 500 | Method badges, status codes |

**Rule: Stop using all-caps for body text.** Reserve `text-transform: uppercase` exclusively for method badges and HTTP status codes — where it serves semantic purpose (they are identifiers, not prose). Every other label, heading, and metadata uses normal case.

---

## 4. Color System

Build with CSS custom properties organised in four layers: **Canvas**, **Surface**, **Label**, **Accent**.

### Dark Mode (default)

```css
:root[data-theme="dark"], :root {
  color-scheme: dark;

  /* Canvas — the deepest backgrounds */
  --canvas-app:       #09090e;   /* main application background */
  --canvas-sidebar:   #0d0e16;   /* sidebar/drawer */
  --canvas-panel:     #111219;   /* panel/card backgrounds */
  --canvas-elevated:  #171923;   /* inputs, hover, elevated cards */
  --canvas-overlay:   #1e2130;   /* dropdowns, modals */

  /* Fill — semi-transparent overlays for state */
  --fill-primary:   rgba(255, 255, 255, 0.10);
  --fill-secondary: rgba(255, 255, 255, 0.06);
  --fill-tertiary:  rgba(255, 255, 255, 0.03);
  --fill-hover:     rgba(255, 255, 255, 0.05);
  --fill-active:    rgba(255, 255, 255, 0.08);

  /* Label — text hierarchy */
  --label-primary:   #e8eaf2;
  --label-secondary: #8b8fa8;
  --label-tertiary:  #4e5270;
  --label-placeholder: #3a3d54;

  /* Separator */
  --separator:        rgba(255, 255, 255, 0.07);
  --separator-opaque: #181b28;

  /* Accent — indigo (more refined than raw purple) */
  --accent:           #6366f1;   /* indigo-500 */
  --accent-hover:     #7375f3;
  --accent-fill:      rgba(99, 102, 241, 0.15);
  --accent-border:    rgba(99, 102, 241, 0.35);
  --accent-text:      #a5b4fc;   /* indigo-300, for text on dark surfaces */

  /* Status */
  --status-success:       #22c55e;
  --status-success-fill:  rgba(34, 197, 94, 0.12);
  --status-warning:       #f59e0b;
  --status-warning-fill:  rgba(245, 158, 11, 0.12);
  --status-error:         #ef4444;
  --status-error-fill:    rgba(239, 68, 68, 0.12);
  --status-info:          #3b82f6;
  --status-info-fill:     rgba(59, 130, 246, 0.12);

  /* HTTP Methods */
  --method-get:     #3b82f6;   /* blue-500 */
  --method-post:    #22c55e;   /* green-500 */
  --method-put:     #f59e0b;   /* amber-500 */
  --method-patch:   #a855f7;   /* purple-500 */
  --method-delete:  #ef4444;   /* red-500 */
  --method-head:    #64748b;   /* slate-500 */
  --method-options: #14b8a6;   /* teal-500 */
}
```

### Light Mode

```css
:root[data-theme="light"] {
  color-scheme: light;

  --canvas-app:       #f5f5f7;   /* Apple's signature near-white */
  --canvas-sidebar:   #ffffff;
  --canvas-panel:     #ffffff;
  --canvas-elevated:  #f0f0f5;
  --canvas-overlay:   #ffffff;

  --fill-primary:   rgba(0, 0, 0, 0.06);
  --fill-secondary: rgba(0, 0, 0, 0.04);
  --fill-tertiary:  rgba(0, 0, 0, 0.02);
  --fill-hover:     rgba(0, 0, 0, 0.04);
  --fill-active:    rgba(0, 0, 0, 0.06);

  --label-primary:   #1d1d1f;   /* Apple's near-black */
  --label-secondary: #6e6e73;
  --label-tertiary:  #aeaeb2;
  --label-placeholder: #c7c7cc;

  --separator:        rgba(0, 0, 0, 0.08);
  --separator-opaque: #e5e5ea;

  --accent:          #4f46e5;   /* indigo-600, slightly deeper for light mode contrast */
  --accent-hover:    #4338ca;
  --accent-fill:     rgba(79, 70, 229, 0.10);
  --accent-border:   rgba(79, 70, 229, 0.30);
  --accent-text:     #4f46e5;

  /* Status and methods same hue, slightly deeper for light contrast */
  --status-success:      #16a34a;
  --status-success-fill: rgba(22, 163, 74, 0.10);
  --status-warning:      #d97706;
  --status-warning-fill: rgba(217, 119, 6, 0.10);
  --status-error:        #dc2626;
  --status-error-fill:   rgba(220, 38, 38, 0.10);
  --status-info:         #2563eb;
  --status-info-fill:    rgba(37, 99, 235, 0.10);

  --method-get:     #2563eb;
  --method-post:    #16a34a;
  --method-put:     #d97706;
  --method-patch:   #9333ea;
  --method-delete:  #dc2626;
  --method-head:    #475569;
  --method-options: #0d9488;
}
```

### Theme Toggle
Add `data-theme` attribute toggle on `<html>` element. Persist preference to `localStorage`. Default: `dark`.

---

## 5. Spacing System (4px base grid)

Define in Tailwind `theme.extend.spacing` so all Tailwind spacing utilities map to the grid:

```js
// tailwind.config.js
spacing: {
  px:  '1px',
  0:   '0',
  0.5: '2px',
  1:   '4px',
  1.5: '6px',
  2:   '8px',
  2.5: '10px',
  3:   '12px',
  3.5: '14px',
  4:   '16px',
  5:   '20px',
  6:   '24px',
  7:   '28px',
  8:   '32px',
  9:   '36px',
  10:  '40px',
  11:  '44px',
  12:  '48px',
  14:  '56px',
  16:  '64px',
  20:  '80px',
  24:  '96px',
}
```

Tailwind's default scale is already 4px-based so this is mostly additive. The key discipline: **never use arbitrary values like `p-[17px]` or `gap-[13px]`** — always round to the nearest grid step.

---

## 6. Border Radius System

```css
:root {
  --radius-xs:  4px;   /* badge interiors, tag corners */
  --radius-sm:  6px;   /* chips, small buttons */
  --radius-md:  10px;  /* inputs, standard buttons */
  --radius-lg:  14px;  /* cards, panels, containers */
  --radius-xl:  18px;  /* drawers, large panels */
  --radius-2xl: 24px;  /* dialogs/modals */
  --radius-full: 9999px; /* pills, toggles */
}
```

Map in Tailwind `theme.extend.borderRadius`:
```js
borderRadius: {
  xs: '4px', sm: '6px', md: '10px', lg: '14px',
  xl: '18px', '2xl': '24px', full: '9999px'
}
```

---

## 7. Motion System

```css
:root {
  --ease-standard:   cubic-bezier(0.3, 0, 0, 1);   /* default — spring-like, Apple-esque */
  --ease-enter:      cubic-bezier(0, 0, 0, 1);       /* decelerate, for things coming in */
  --ease-exit:       cubic-bezier(0.3, 0, 1, 1);     /* accelerate, for things leaving */

  --dur-micro:    80ms;    /* hover states, color changes */
  --dur-quick:    150ms;   /* button press feedback, toggles */
  --dur-standard: 250ms;   /* panel state changes, tab switches */
  --dur-enter:    320ms;   /* drawers sliding in, dialogs appearing */
  --dur-exit:     200ms;   /* dismissals (faster feels snappier) */
}
```

**Rules:**
- All hover state transitions: `--dur-micro --ease-standard`
- All toggle/checkbox/select state: `--dur-quick --ease-standard`
- Drawer slide: `--dur-enter --ease-enter` in, `--dur-exit --ease-exit` out
- Dialog appear: fade + scale(0.97→1), `--dur-enter --ease-enter`
- No transitions on font-size or layout-affecting properties (causes jank)

---

## 8. Elevation System

Replace the current mix of `bg-black/80`, `border-slate-800/70`, and random box-shadows with a systematic approach:

| Level | Usage | CSS |
|---|---|---|
| 0 | App canvas | `background: var(--canvas-app)` |
| 1 | Panels, cards | `background: var(--canvas-panel); border: 1px solid var(--separator)` |
| 2 | Inputs, interactive surfaces | `background: var(--canvas-elevated); border: 1px solid var(--separator)` |
| 3 | Dropdowns, tooltips, popovers | `background: var(--canvas-overlay); backdrop-filter: blur(20px) saturate(180%); border: 1px solid var(--separator); box-shadow: 0 8px 24px rgba(0,0,0,0.5)` |
| 4 | Modals, dialogs | `background: var(--canvas-overlay); backdrop-filter: blur(32px) saturate(200%); box-shadow: 0 16px 48px rgba(0,0,0,0.6)` |

The key shift: **no more ad-hoc `bg-black/80` or `bg-slate-900/50`** — everything uses semantic canvas variables.

---

## 9. Icon System

Keep Material Symbols Outlined. Standardise variation settings and sizes:

```css
/* Size variants */
.icon-sm  { font-size: 16px; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 16; }
.icon-md  { font-size: 20px; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20; }  /* default */
.icon-lg  { font-size: 24px; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24; }
.icon-xl  { font-size: 32px; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48; }

/* State modifier */
.icon-filled { --icon-fill: 1; }
```

**Rule**: Use `wght: 300` as default (matches Apple SF Symbols regular weight). Use `wght: 400` only for icon buttons that need optical emphasis. Never go above 400 for UI icons.

**Icon size assignments:**
- 16px: Inline with text, badges, list row accessories
- 20px: Action buttons, toolbar buttons, list row icons
- 24px: Navigation, modal close buttons
- 32px: Empty state illustrations (supplement with text, not standalone)

---

## 10. Component Design Specifications

### Toolbar / App Header
- Single horizontal bar, sticky at top: height 52px
- Left: hamburger toggle (icon only, 20px, `--label-secondary` color) → app wordmark ("API Sandbox" in `--type-title-3`, `--label-primary`)
- Right: environment switcher (compact, max 200px) → lock button (icon only) → theme toggle (icon only)
- Background: `var(--canvas-sidebar)` with `border-bottom: 1px solid var(--separator)`
- **Remove**: "Reset All" danger button from toolbar. Move destructive actions to a settings sheet / overflow menu to prevent accidental triggering.

### Sidebar
- Fixed 300px width desktop, drawer on mobile
- Background: `var(--canvas-sidebar)`
- No header within the sidebar — the app toolbar acts as the header
- Collections section: label in `--type-subhead` `--label-secondary`, no uppercase
- Tree items: `--type-body` text, icon (20px) + label + method badge (if request node)
- Active/selected state: `var(--accent-fill)` background, `var(--accent-text)` for text, left 3px border `var(--accent)`
- History section: moved OUT of sidebar — see Feature Audit plan

### Method Badge
Replace hardcoded hex Tailwind classes with a semantic badge component:
```html
<span class="method-badge method-get">GET</span>
```
```css
.method-badge {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  text-transform: uppercase;
}
.method-get     { background: rgba(59,130,246,0.15); color: var(--method-get); }
.method-post    { background: rgba(34,197,94,0.15);  color: var(--method-post); }
.method-put     { background: rgba(245,158,11,0.15); color: var(--method-put); }
.method-patch   { background: rgba(168,85,247,0.15); color: var(--method-patch); }
.method-delete  { background: rgba(239,68,68,0.15);  color: var(--method-delete); }
.method-head    { background: rgba(100,116,139,0.15);color: var(--method-head); }
.method-options { background: rgba(20,184,166,0.15); color: var(--method-options); }
```

### Request Composer
- **Remove** `<p-card>` wrapper — replace with a clean `<section>` using `var(--canvas-panel)` + `var(--separator)` border
- URL bar is the primary action surface — make it more prominent: height 48px, full-width, `var(--canvas-elevated)` background, left-aligned method badge inside the field (not a separate dropdown visually)
- Actually: method selector as a pill-style select on the LEFT of the URL bar (same row, not stacked on mobile smaller than sm)
- Tab labels: normal case, `--type-subhead`, not uppercase
- Editor mode toggle (Basic/JSON): use an Apple-style segmented control (two rounded pill buttons side by side with a shared rounded container), not PrimeNG SelectButton

### Response Viewer
- Container: `var(--canvas-panel)` background, `var(--separator)` top border — not the current `bg-black/80`
- Tabs: pill-style segmented control (same as above), not underline tabs
- Status code: prominent badge — use `--status-success-fill` / `--status-error-fill` with large `--type-title-2` status code number
- Body: Monaco editor is fine for read-only JSON (already used, keep it) — but configure it with a custom dark theme matching our color system, not the default Monaco theme
- Timings waterfall: bars use `var(--accent)` as fill color, not hardcoded `bg-emerald-500`

### Buttons
Define three canonical variants, not the ad-hoc mix currently used:

```css
/* Primary */
.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  transition: background var(--dur-quick) var(--ease-standard),
              transform var(--dur-micro) var(--ease-standard);
}
.btn-primary:hover  { background: var(--accent-hover); }
.btn-primary:active { transform: scale(0.97); }

/* Secondary / Ghost */
.btn-secondary {
  background: var(--fill-secondary);
  color: var(--label-primary);
  border: 1px solid var(--separator);
  border-radius: var(--radius-md);
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
}
.btn-secondary:hover { background: var(--fill-primary); }

/* Danger */
.btn-danger {
  background: var(--status-error-fill);
  color: var(--status-error);
  border: 1px solid rgba(239,68,68,0.3);
  border-radius: var(--radius-md);
}

/* Icon button */
.btn-icon {
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px;
  color: var(--label-secondary);
  transition: background var(--dur-micro), color var(--dur-micro);
}
.btn-icon:hover { background: var(--fill-primary); color: var(--label-primary); }
```

**No more `uppercase` on button labels.** Use sentence case.

### Inputs / Form Controls
```css
.form-input {
  background: var(--canvas-elevated);
  border: 1px solid var(--separator);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-size: 14px;
  color: var(--label-primary);
  transition: border-color var(--dur-quick);
}
.form-input:focus {
  border-color: var(--accent-border);
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-fill);
}
.form-input::placeholder { color: var(--label-placeholder); }
```

### Tabs (Segmented Control style)
Replace PrimeNG Material underline tabs with Apple-style segmented controls:
```css
.seg-control {
  display: inline-flex;
  background: var(--fill-secondary);
  border-radius: var(--radius-sm);
  padding: 3px;
  gap: 2px;
}
.seg-option {
  border-radius: calc(var(--radius-sm) - 2px);
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--label-secondary);
  transition: background var(--dur-quick), color var(--dur-quick);
  cursor: pointer;
}
.seg-option.active {
  background: var(--canvas-overlay);
  color: var(--label-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
```

### Dialogs / Modals
- Backdrop: `rgba(0,0,0,0.5)` with `backdrop-filter: blur(4px)`
- Modal container: `var(--canvas-overlay)` + `border: 1px solid var(--separator)` + `border-radius: var(--radius-2xl)` + level-4 shadow
- **On mobile**: Sheet style — slides up from bottom, full width, rounded top corners only, `border-radius: var(--radius-xl) var(--radius-xl) 0 0`

### Variable Chips (in request composer)
Simplify from 4 to 3 states:
- **Resolved from environment**: `var(--status-info-fill)` background, `var(--status-info)` text — blue
- **Resolved from request**: `var(--accent-fill)` background, `var(--accent-text)` — indigo
- **Unresolved / missing**: `var(--status-error-fill)` background, `var(--status-error)` — red, with pulsing animation (subtle, 2s ease-in-out opacity pulse)

Remove the "global" source category until a global variables store is actually implemented.

---

## 11. PrimeNG Theme Migration

Migrate from Material preset to **Aura** preset (PrimeNG 20.x), which is more minimal and easier to override with CSS custom properties.

```typescript
// app.config.ts
import Aura from '@primeng/themes/aura';

const SandboxTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50:  '{indigo.50}',
      100: '{indigo.100}',
      200: '{indigo.200}',
      300: '{indigo.300}',
      400: '{indigo.400}',
      500: '{indigo.500}',
      600: '{indigo.600}',
      700: '{indigo.700}',
      800: '{indigo.800}',
      900: '{indigo.900}',
      950: '{indigo.950}',
    },
    colorScheme: {
      dark: {
        surface: {
          0:   '#09090e',
          50:  '#0d0e16',
          100: '#111219',
          200: '#171923',
          300: '#1e2130',
          400: '#252840',
          500: '#2e3350',
          600: '#3a3f60',
          700: '#474d70',
          800: '#6b7280',
          900: '#9ca3af',
          950: '#d1d5db',
        },
      },
    },
  },
});
```

This maps PrimeNG's internal surface scale to our canvas tokens, so all PrimeNG components automatically use our palette.

---

## 12. Responsive Design

| Breakpoint | Width | Layout |
|---|---|---|
| `xs` | < 480px | Single column, all panels stacked vertically; nav drawer full-screen |
| `sm` | 480–767px | Single column, drawer overlay mode |
| `md` | 768–1023px | Sidebar pinned (240px), content area grows |
| `lg` | 1024–1279px | Sidebar pinned (280px), two-column request + response (vertically split) |
| `xl` | ≥ 1280px | Sidebar (300px), full request composer, response panel below or beside |

On `md+`, sidebar is persistent (no drawer). On `sm-`, sidebar is a full-height drawer.

---

## 13. File Structure

Create `src/design-system/` directory:

```
src/design-system/
  tokens.css          ← all CSS custom properties (colors, spacing, radius, motion)
  typography.css      ← font stack imports + type scale utility classes
  components.css      ← canonical component classes (btn-*, form-*, method-badge, etc.)
  primeng-overrides.css  ← ::ng-deep-free PrimeNG CSS variable overrides
  animations.css      ← keyframe animations (skeleton shimmer, chip pulse, etc.)
```

Import order in `styles.css`:
```css
/* 1. External fonts */
@import url("...");
/* 2. Design system */
@import "design-system/tokens.css";
@import "design-system/typography.css";
@import "design-system/components.css";
@import "design-system/primeng-overrides.css";
@import "design-system/animations.css";
/* 3. Monaco */
@import "monaco-editor/min/vs/editor/editor.main.css";
/* 4. Tailwind */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 14. Tailwind Config Changes

```js
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        accent: 'var(--accent)',
        canvas: {
          app:      'var(--canvas-app)',
          sidebar:  'var(--canvas-sidebar)',
          panel:    'var(--canvas-panel)',
          elevated: 'var(--canvas-elevated)',
          overlay:  'var(--canvas-overlay)',
        },
        label: {
          primary:   'var(--label-primary)',
          secondary: 'var(--label-secondary)',
          tertiary:  'var(--label-tertiary)',
        },
      },
      borderRadius: {
        xs: '4px', sm: '6px', md: '10px',
        lg: '14px', xl: '18px', '2xl': '24px',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.3, 0, 0, 1)',
        enter:    'cubic-bezier(0, 0, 0, 1)',
        exit:     'cubic-bezier(0.3, 0, 1, 1)',
      },
    },
  },
  corePlugins: { preflight: false },
  plugins: [],
};
```

---

## 15. Implementation Checklist

### Phase A — Foundation (do first, no visible UI change)
- [ ] Create `src/design-system/` with `tokens.css`
- [ ] Update `tailwind.config.js` with font families, semantic color references, radius, easing
- [ ] Migrate `app.config.ts` from Material to Aura preset with SandboxTheme
- [ ] Import `tokens.css` in `styles.css`, replace hardcoded body/html background
- [ ] Add `data-theme="dark"` to `<html>` in `index.html`
- [ ] Add Inter + JetBrains Mono Google Fonts imports

### Phase B — Typography & Color normalization
- [ ] Create `typography.css` with type scale utility classes
- [ ] Replace all ad-hoc `text-[#hex]` method color classes with `.method-*` badge classes
- [ ] Replace all `bg-[#0b0f19]`/`bg-black/80`/`bg-slate-900/XX` with canvas token classes
- [ ] Remove uppercase from all labels except method badges and HTTP status codes
- [ ] Update all `text-slate-*` label uses to `text-label-primary/secondary/tertiary` token classes

### Phase C — Component redesign
- [ ] Rewrite toolbar/header — remove "Reset All" from header, add theme toggle
- [ ] Replace `<p-card>` in request composer with `<section>` using token backgrounds
- [ ] Redesign method select + URL bar as unified input row
- [ ] Replace PrimeNG underline `<p-tabs>` with segmented control component in all three locations
- [ ] Redesign all dialogs with blur backdrop, rounded corners, sheet on mobile
- [ ] Implement `components.css` button classes, apply across all button instances
- [ ] Redesign variable chips (3 states, simplified)
- [ ] Update Monaco editor theme to match dark canvas

### Phase D — Light mode
- [ ] Add light mode CSS variables to `tokens.css`
- [ ] Create theme toggle button component
- [ ] Verify all components render acceptably in light mode
- [ ] Test PrimeNG components in light mode

### Phase E — Polish
- [ ] Implement motion: drawer transitions, dialog appear/dismiss animations
- [ ] Add skeleton shimmer animation for loading states
- [ ] Add chip pulse animation for missing variables
- [ ] Audit and remove all remaining `::ng-deep` overrides, replace with CSS variable approach
- [ ] Responsive audit: test every panel at xs, sm, md, lg, xl breakpoints
