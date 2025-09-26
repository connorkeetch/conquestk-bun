# Profile Page UX Review

## Current Issues to Address
- **Color conflicts**: Player-selected colors can clash with rank colors, creating low contrast (e.g., red player color + raider rank red).
- **Redundancy**: Rank, badges, and player-selected themes repeat similar information in multiple sections.
- **Readability across themes**: The page does not enforce minimum contrast ratios, so darker themes + dark avatars become muddy.
- **Information hierarchy**: Activity stats, achievements, and personalization elements compete for attention without a clear hierarchy.

## Strategy for Color Usage
1. **Decouple rank identity from background blocks**
   - Keep rank colors in small, high-contrast badges (e.g., pill-shaped label next to the rank name).
   - Use a neutral background for player cards; only accent elements (icons/borders) should reference the rank color.
2. **Player-chosen color as an accent**
   - Apply the player color to lightweight accents like border glow, button focus states, or progress bar fill.
   - Show a swatch or gradient chip within the profile header to communicate their chosen color without taking over text areas.
3. **Contrast safety net**
   - Clamp player color usage through design tokens: if the chosen color fails WCAG AA contrast, shift it to the nearest accessible shade.
   - Provide fallbacks (e.g., neutral gray) when rank color equals the player color to avoid “all red” scenarios.
4. **Consistent legends**
   - Move the full rank-color legend to a tooltip or dedicated modal rather than repeating it on every profile.

## Placement Recommendations
- **Profile header**
  - Left side: avatar with a subtle ring in the player’s chosen color.
  - Right side: display name, pronouns, and rank title with a compact rank badge.
  - Under header: primary actions (Challenge, Invite) using neutral buttons, with hover states adopting the player color.
- **Player card / stats section**
  - Keep backgrounds neutral; use the player color for highlight lines and progress bars.
  - Rank information appears once here with textual description (e.g., “Rank: Raider • Top 15%”).
- **Achievements & history**
  - Group achievements into cards using neutral palettes; use rank color only for rank-related achievements.
  - Match history rows use the player color to highlight wins/losses subtly (icon fills, small markers).

## Reducing Redundancy
- Show rank **once** in the header with the badge and textual description.
- Show player color as an accent and a single swatch; avoid repeating it in multiple components.
- Remove duplicate rank mentions from match history cards; include rank deltas only when they change.
- Combine scattered stats into a single “Overview” widget with tabs (Performance, Social, Cosmetics) to prevent repetition.

## UI & UX Enhancements
- Introduce a responsive, two-column layout: header + overview on top, tabs below for achievements, recent matches, and loadouts.
- Add a “personalization” tab for cosmetics, showing the color swatch and other unlocks.
- Ensure typography scale increases for key metrics and maintains at least 1.2em body text.
- Add motion cues (micro-animations) when hovering over cards to reinforce interactivity without overwhelming color usage.
- Implement skeleton loaders for profile sections to improve perceived performance while data loads.

## Inspiration References
- **Destiny 2** companion app: rank badges stay compact while backgrounds remain neutral, keeping text readable.
- **Overwatch 2** career profiles: use of tabs and neutral panels to separate stats, achievements, and history.
- **Valorant** career page: player-selected card art is distinct from rank badge colors, preventing clashes.

## Next Steps
1. Audit current Tailwind tokens to add accessible variants (e.g., `--rank-raider`, `--rank-raider-contrast`).
2. Prototype the header + overview layout in Figma using accessible color combos.
3. Implement color-clamping utility in shared UI helpers to enforce contrast automatically.
4. Update the React components to adopt the new layout and remove redundant rank mentions.
5. Playtest with users who choose high-contrast + low-contrast colors to validate readability.
