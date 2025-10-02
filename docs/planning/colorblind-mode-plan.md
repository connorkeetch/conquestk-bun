# Colorblind Mode Accessibility Plan

## Purpose & scope
- Translate the existing colorblind mode placeholder into a fully functional accessibility option across frontend, backend, and gameplay flows.
- Document palette, data, and UX decisions ahead of implementation so design, engineering, and QA stay aligned.
- Identify risks, validation steps, and sequencing to ship incrementally without breaking existing color assignments.

## Player & product goals
1. Ensure color-dependent gameplay elements (territories, player badges, logs) remain distinguishable for players with common color vision deficiencies.
2. Persist the preference across devices so players retain their accessibility setting on every session.
3. Ship the feature without impacting non-colorblind players' current experience or degrading map readability.
4. Collect enough feedback/telemetry to iterate on palette choices if reports surface visibility issues.

## Current state snapshot
- UI toggle exists in **Settings → Display** but is disabled behind the `COMING_SOON_UI` flag and hard-coded `isWorking: false`.
- Player colors rely on the 12-color `PLAYER_COLORS` palette; helpers (`getPlayerColor`, `getColorValue`) assume the current hex values and have no alternate palette concept.
- Components read `player.color` directly (maps, badges, overlays, activity log) so overrides must be centralized to avoid regressions.
- Frontend settings state only tracks theme and preferred color; there is no place to store `colorblindMode` locally or in API payloads.
- Backend `user_preferences` table and `/auth/settings` + `/api/preferences` routes do not expose a colorblind flag.
- Game creation logic assigns colors from the standard palette; server/client need consistent mapping if an accessibility palette is added.

## Success metrics
- ≥ 95% of UI touchpoints that show player colors respect the accessibility palette when the toggle is on (verified by audit checklist).
- No increase in support tickets tied to "can’t tell players apart" within 30 days of launch.
- Settings API latency remains < 150 ms p95 after adding the new flag.
- Usability feedback from at least 3 colorblind testers validates palette legibility before full release.

## Implementation phases

### Phase 1 – Palette definition & design review
- Produce a 12-color accessible palette (plus premium variants if applicable) that meets WCAG contrast guidance and avoids common color vision conflicts.
- Map each baseline color to its accessible counterpart; include rationale (e.g., protanopia friendly) in `frontend/src/constants/colors.ts` comments.
- Review palette with Connor and at least one colorblind tester or simulator run before committing to engineering rollout.

### Phase 2 – Frontend state & settings plumbing
- Add `colorblindMode` boolean to the Redux settings slice (`frontend/src/store/settingsSlice.ts`).
- Update local persistence helpers (`loadSettings`, `saveSettings`, `persistSetting`) to read/write the new flag and include it in API payloads.
- Remove the `COMING_SOON_UI` gate or ensure it’s enabled for QA; hook the settings toggle `onChange` to dispatch the new action.
- Provide a subtle tooltip or helper text in the settings modal explaining what the mode changes and how to report issues.

### Phase 3 – Color resolution helpers & UI coverage
- Introduce a resolver helper (e.g., `resolvePlayerColor(color, { colorblindMode })`) that remaps standard palette values to accessible equivalents while falling back safely for premium/gradient colors.
- Update all components that render player colors (Risk map layers, player badges, elimination banners, logs, custom maps) to rely on the resolver instead of raw `player.color`.
- Add lightweight unit tests around the resolver to ensure the mapping holds and premium colors bypass remapping.
- Perform manual visual QA on world map, custom maps, and lobby avatars with the toggle on/off.

### Phase 4 – Backend persistence & API updates
- Create migration adding nullable `colorblind_mode` boolean to `user_preferences` (default `false`).
- Update `UserPreferencesService`, preference DTOs, and settings controllers to read/write the new field.
- Extend `/auth/settings` and `/api/preferences` schemas, validation, and shared TypeScript types to include the flag.
- Ensure the new field propagates through authentication bootstrap flows so the frontend initializes state correctly after login.

### Phase 5 – Telemetry, QA, and launch checklist
- Instrument analytics event when players enable/disable colorblind mode to gauge adoption.
- Draft QA checklist covering: map readability, player elimination states, fog-of-war (if applicable), and notifications.
- Ship to staging behind feature flag; run with colorblind testers, gather feedback, iterate on palette if necessary.
- Prepare release notes and update accessibility documentation (`docs/guides/theme-system.md` or new page) before production rollout.

## Risks & mitigations
- **Palette still confusing for some users** → Collect feedback quickly, keep palette mapping in config to allow hotfix adjustments.
- **Missed UI surface** → Maintain a component audit checklist; consider writing an ESLint/Biome rule later to enforce resolver usage.
- **Backend migration rollout** → Schedule migration during low-traffic window, confirm default `false` state to avoid breaking existing payloads.
- **Performance regressions** → Keep resolver pure/simple and memoize where needed (e.g., expensive map renders) to avoid repaint cost.

## Open questions
- Should premium/purchased colors offer accessible alternatives or be disabled when colorblind mode is on?
- Do we want a per-game override (e.g., host forces accessibility palette for everyone) or purely per-user preference?
- Should we expose palette selection in future (e.g., "Classic", "High Contrast") or keep a single accessible set initially?
- Are there any backend analytics dashboards that must be updated to flag colorblind usage for support follow-up?

## Next steps
1. Schedule mini design review to lock palette selection and document mapping matrix.
2. Draft migration and frontend state changes in separate PRs to keep review focused.
3. Create QA checklist and share with testers once feature flag is ready on staging.
4. Update onboarding/support docs to highlight the new accessibility option once release is approved.
