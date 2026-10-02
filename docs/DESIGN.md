# Gold Terminal Design System

## Direction

Use a calm, high-clarity operations interface for a gold counter: warm gold as a restrained brand cue, dark readable text, neutral surfaces, and explicit status labels. This is a design specification, not a new component library.

The project has React, Vite, and plain CSS but no component library or CSS framework. Keep semantic HTML and CSS custom properties for the current small set of operational workflows. This avoids adding a runtime dependency. MUI is a possible future option if the app grows to require a broad widget suite, but is not needed for this build.

The tokens below are defined under `--terminal-*` names in the existing `frontend/src/index.css`. The terminal UI consumes them from its application and page styles without replacing the starter variables.

## Color tokens

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--terminal-bg` | `#F5F6F8` | `#14181D` | Main page background. |
| `--terminal-surface` | `#FFFFFF` | `#1F252C` | Cards, menus, and form surfaces. |
| `--terminal-surface-raised` | `#FFFFFF` | `#272F38` | Dialogs and elevated areas. |
| `--terminal-text` | `#1B222B` | `#F3F5F7` | Main text. |
| `--terminal-text-muted` | `#536171` | `#B0BAC5` | Secondary text; retain readable contrast. |
| `--terminal-border` | `#D7DDE5` | `#39434E` | Dividers, input borders, and card outlines. |
| `--terminal-primary` | `#765500` | `#F0BD4B` | Primary actions and active navigation. |
| `--terminal-primary-contrast` | `#FFFFFF` | `#1A1710` | Text on primary-action background. |
| `--terminal-accent-soft` | `#FFF3D6` | `#3A3020` | Non-interactive gold highlight. |
| `--terminal-success` | `#176B43` | `#75D6A6` | Success text/icon, paired with a label. |
| `--terminal-danger` | `#B42318` | `#FF8A80` | Error/destructive text, paired with a label. |
| `--terminal-warning` | `#805600` | `#F4C66A` | Warning text, paired with a label. |
| `--terminal-focus` | `#155EEF` | `#84ADFF` | Visible keyboard focus ring. |

Do not use color alone to convey success, warning, or failure. Check text/background pairs against WCAG AA (4.5:1 for normal-size text) when applying tokens to components.

## Type

- Family: system UI sans-serif (`system-ui, "Segoe UI", Roboto, sans-serif`).
- Body and controls: `14px` minimum, `1.5` line-height; use `16px` for long-form reading.
- Page title: `28–32px`, weight `650–700`; section title `18–20px`, weight `600`.
- Labels: `13–14px`, weight `550–600`.
- Identifiers and receipts: system monospace, used sparingly.

## Spacing, corners, and depth

- Spacing scale: `4, 8, 12, 16, 24, 32, 40, 48px`.
- Compact field/control gap: `8–12px`; normal card padding: `20–24px`; page gutters: `24px` desktop and `16px` mobile.
- Radius: `6px` for controls, `10px` for cards, `14px` for dialogs, pill only for compact status tags.
- Shadows: one subtle elevation for menus/dialogs; prefer border and surface contrast for ordinary cards. Avoid heavy shadows.

## Component patterns

| Component | Variants and behavior |
|---|---|
| Button | Primary (gold action), secondary (outlined/neutral), quiet (text), danger (destructive only). Minimum height `44px`; disabled and focus-visible states must remain distinct. |
| Input/select/textarea | Full-width within a field group, visible label, helper/error text below, `44px` minimum control height, clear focus ring and invalid border plus text. |
| Card | White/dark surface, subtle border, `10px` radius, consistent padding; heading and content aligned to the same spacing scale. |
| Status/feedback | Icon or text label plus status color; announce asynchronous results accessibly. Do not rely on color alone. |
| Navigation | Clear active state, text labels, keyboard operation, compact layout on narrow screens. |

## Dark mode and motion

Use the dark token values when the operating system prefers dark mode, unless a later approved UI adds an explicit theme control. Keep surfaces distinct from the page background and preserve readable muted text. Honor `prefers-reduced-motion`; transitions should be brief and limited to color, opacity, or small positional changes.

## Accessibility baseline

- Use semantic headings and one page-level `h1`.
- Associate every form control with a visible label; connect helper/error text programmatically.
- Keep all interactive targets at least `44 × 44px` where practical.
- Provide a visible `:focus-visible` outline; never remove keyboard focus without an equivalent.
- Validate text/background contrast to WCAG AA, especially muted text and button states.
- Announce loading, errors, and success feedback to assistive technology.
