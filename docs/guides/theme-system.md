# Theme System

## Why It Exists
ConquestK ships multiple visual themes (default, dark, RetroSpace, seasonal drops) without duplicating component code. The theming layer is **CSS-first**: JavaScript simply toggles the `data-theme` attribute, while CSS variables and semantic utilities handle the visuals. That keeps first paint fast, avoids FOUC, and makes theme rollouts predictable.

## File Map
- `frontend/src/app.css`
  - Light-first baseline tokens under `:root`
  - Theme overrides (`:root[data-theme="*"]`)
  - Shared utilities (`@layer utilities`) and semantic component classes (`@layer components`)
- `frontend/src/themes/*.css`
  - Optional theme-specific overrides when a theme needs more than the defaults
- `frontend/src/utils/themeLoader.ts`
  - Runs before React hydrates, applies the stored theme to prevent flash
- `frontend/src/config/themes.config.ts`
  - Theme metadata (name, description, preview color) used by selectors/settings
- `frontend/src/constants/colors.ts`
  - Game art colors only (armies, ranks). Themes do **not** live here.
- Database: `user_preferences` table (baseline schema)
  - Persists a user’s theme choice so it follows them across devices

## Token Baseline (light-first)
`frontend/src/app.css` defines neutral defaults on `:root`. Themes only override what changes.

**Core categories**
- **Typography**: `--font-family-base`, `--text`, `--text-muted`, `--heading`, `--link`
- **Surfaces**: `--surface-0`, `--surface-1`, `--surface-2`, `--panel-bg`, `--panel-border`, `--panel-bg-alt`
- **Chrome**: `--nav-bg`, `--nav-border`, `--footer-bg`, `--modal-bg`, `--modal-border`, `--body-bg-image`, `--body-bg-attachment`
- **Interaction**: `--hover-bg`, `--hover-border`
- **Radii**: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-surface`
- **Elevation**: `--shadow-0`, `--shadow-1`, `--shadow-2`, `--shadow-modal`
- **Glass**: `--glass-bg`, `--glass-bg-light`, `--glass-border`, `--glass-blur`, `--glass-shadow`, `--glass-radius-sm`, `--glass-radius-lg`
- **Legacy aliases** kept for gradual cleanup: `--color-*`, `--box-*`, `--surface-glass*`

**Example**
```css
:root {
  --text: #0f172a;
  --surface-1: #ffffff;
  --nav-bg: #ffffff;
  --radius-md: 8px;
  --shadow-1: 0 1px 2px rgba(15, 23, 42, 0.12);
  --glass-bg: rgba(255, 255, 255, 0.65);
}
```

### Dark & RetroSpace Overrides
- `:root[data-theme="dark"]` (also aliased as `default`) restores the legacy dark look by overriding surface colors, radii, shadows, and glass tokens.
- `frontend/src/themes/retrospace.css` now overrides only tokens (Verdana stack, square radii, flat chrome, zero shadows). Body/backdrop styles read `--body-bg-*` tokens instead of bespoke rules.

Other themes can continue to override selective tokens. If a theme needs structural tweaks beyond variables, prefer adding theme-specific selectors in its CSS file rather than mutating components.

## Semantic Utility Layer
Implemented in `app.css` under `@layer components`. These classes consume the tokens above so React components can drop bespoke Tailwind chains:

- **Surfaces**: `.panel`, `.panel-muted`, `.panel-outline`
- **Buttons**: `.btn` base plus `.btn-primary`, `.btn-secondary`, `.btn-tertiary`, `.btn-outline`, `.btn-ghost`, `.btn-danger`, `.btn-success`, `.btn-icon`, `.btn-sm`, `.btn-lg`
- **Forms**: `.form-label`, `.form-input`, `.form-select`, `.form-help`, `.form-checkbox`, `.form-radio`
- **Navigation**: `.nav-bar`, `.nav-item`, `.nav-item-active`, `.nav-dropdown`
- **Badges & Chips**: `.badge`, `.chip`
- **Tables & Lists**: `.table`, `.table-row`, `.list`, `.list-item`
- **Modals**: `.modal`, `.modal-header`, `.modal-body`, `.modal-footer`

RetroSpace (or any square theme) automatically gets sharp corners and flat chrome because the tokens it overrides feed every class above.

## Using the System
1. **Pick the semantic class first.** Example: wrap cards with `.panel` instead of `rounded-xl shadow-xl bg-slate-900/40`.
2. **Reach for tokens in CSS when semantically unique.** e.g. a new HUD overlay can use `border-radius: var(--radius-sm)` directly.
3. **Legacy Tailwind utilities** are still available for layout/spacing, but avoid hardcoding radii, shadows, blur, or color values that already exist as tokens.
4. **Glass effects**: use `.panel.glass` + custom modifier, or directly reference `--glass-*` tokens if you need something special.
5. **When adding a theme**, only override tokens (`--text`, `--panel-bg`, etc.) unless a bespoke selector is unavoidable.

## RetroSpace Migration Checklist
Latest status (2025‑03‑12):
- ✅ Token baseline split into light-first root + dark overrides + RetroSpace token hooks.
- ✅ Semantic utility layer scaffolding added for surfaces, buttons, forms, nav, tables, lists, modals.
- 🔄 In progress: convert high-traffic screens to `.panel`/`.btn`/`.form-*` classes and delete redundant Tailwind chains.
- 🔄 Pending: migrate remaining glass/translucent components, extract hero gradients into tokens, add RetroSpace-only textures via `--body-bg-image` when ready.
- 🔄 QA: visual diff (default, dark, RetroSpace), run `npm run lint`, `npm run test:frontend`, `npm run build` before launch.

## Adding or Updating Themes
1. **Tokens** – update `:root[data-theme="yourtheme"]` (or add a new file in `frontend/src/themes/`). Keep overrides token-only when possible.
2. **Metadata** – add to `themes.config.ts` so the picker displays the theme.
3. **Assets** – theme-specific fonts or images belong in `frontend/public/themes/` or CDN as needed; reference them via tokens like `--body-bg-image`.
4. **Testing** – validate in a private lobby (`npm run dev`) and in production build (`npm run build && npm run preview`).

## Component Migration Tips
- Replace `bg-surface-*`, `rounded-*`, `shadow-*`, and `backdrop-blur-*` usages with the semantic classes.
- If a component still needs Tailwind for layout (grid, flex, spacing), keep those utilities alongside the new semantic class.
- When a replacement is risky, leave a `// TODO(theme)` comment and capture the follow-up in Jira/Linear.

## Troubleshooting
- **Theme not applying?** Ensure `data-theme="name"` matches CSS selectors and the loader runs before React.
- **RetroSpace looks rounded?** Some hardcoded `rounded-*` remains—swap to `.panel` or the appropriate token.
- **Unexpected blur/glow?** Audit for legacy `.glass`, `backdrop-blur`, or gradient utilities; replace with tokenized equivalents.

## Historical Notes
- 2024‑10: Migrated from JS theme maps to CSS variables.
- 2025‑03: Token baseline expanded; semantic utility layer introduced as part of RetroSpace unification.

This document is now the single source of truth for theming. If a future change alters tokens, utilities, or migration strategy, update this file and reference it from release notes.
