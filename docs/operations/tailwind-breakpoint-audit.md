Tailwind Breakpoint Audit – Initial Pass

Scope
- Frontend responsive behavior with emphasis on high‑DPI phones/tablets.
- Hit targets and scroll/pinch interactions around the game map.

Observations
- Base tap targets in MapToolbar already meet 44×44 guideline.
- MapCanvas now sets touch-action: none to stabilize two‑finger pinch/zoom (prevents browser gestures from stealing events on iOS Safari and Android Chrome).
- Several views use dense text/spacing at < md; some headings/buttons could scale slightly for readability.

Proposed adjustments (low‑risk)
- Typography scale
  - Headings: use text-lg md:text-xl for section headers on small screens.
  - Body: prefer text-sm md:text-base in dense panels.

- Spacing and layout
  - Navbar/primary actions: add px-3 py-2 md:px-4 md:py-2 to improve hit areas on small screens.
  - Cards/panels: gap-3 md:gap-4 for readability.

- Map toolbar
  - Existing min-h/min-w: 44px are good; ensure gap-2 md:gap-3 on container.
  - Preset buttons: ensure w-[72px] md:w-[84px] for clearer labels.

- Inputs and toggles
  - Form controls: min-h-[44px] px-3 on mobile; md:min-h-[38px] to reduce bulk on desktop.

- Hover-only affordances
  - Replace hover:tooltips with tap-friendly variants or focus-visible on touch devices; hide hover-only cues via @media (hover: hover) where applicable.

Suggested diffs (targeted)
- frontend/src/components/game/MapToolbar.tsx
  - Container: add md:gap-3.
  - Presets: add md:w-[84px].

- frontend/src/components/Header.tsx
  - Main nav items: add text-sm md:text-base and px-3 md:px-4.

Verification checklist
- iPhone 13/14/15 Safari: pinch-zoom map, scroll page outside map area, ensure no accidental zoom on single finger.
- Pixel 6/7 Chrome: same as above; verify button hit targets feel generous.
- Landscape tablet (iPad/Android): ensure no crowding in toolbars; headings maintain visual hierarchy.

Next steps (optional)
- Add a responsive utility class (e.g., .touch-target) for consistent 44×44 adoption.
- Introduce media queries using @media (pointer: coarse) to adjust UI affordances on touch.

