# Orphaned code and assets audit (February 2025)

## Summary
- Identified legacy UI components, pages, and a service layer that are no longer wired into the runtime app.
- Grouped orphaned assets by feature area and outlined whether they should be deleted outright or re-integrated with concrete follow-up steps.
- Highlighted modern equivalents already in use so we can confidently retire duplicated implementations.

## Quick reference table
| Area | Artifact | Observed role | Recommendation |
| --- | --- | --- | --- |
| Audio UX | `frontend/src/components/MuteButton.tsx` | Floating mute toggle for global audio | Remove; Game Room footer already exposes mute control everywhere it is needed. |
| Map tools | `frontend/src/components/MapVersionManager.tsx` | Map version CRUD & submission UI | Either mount inside the map editor/admin review workflow or delete after confirming the backend endpoints have a replacement UI. |
| Map tools | `frontend/src/components/ResponsiveMapContainer.tsx`, `MapImageControls.tsx` | Legacy zoom/pan container + image control tabs | Delete; map rendering now flows through `mapViewSlice` + `MapCanvas`. |
| Lobby/team | `frontend/src/components/TeamAssignment.tsx` | Drag-and-drop team assignment widget | Integrate into the lobby host view so the existing `/rooms/:id/team-assignments` API is reachable, or delete if the workflow is dead. |
| Lobby/team | `frontend/src/pages/GameLobby.tsx` | Early lobby page that lists rooms | Delete; `/lobby` routes to `LobbyPage` now. |
| Capital mode | `frontend/src/components/CapitalSelector.tsx`, `CapitalMarker.tsx`, `CapitalAttackWarning.tsx`, `CapitalEliminationNotification.tsx` | Capital game-mode helpers (UI warnings/selectors) | Decide if capitals mode is still on the roadmap. If so, wire these into the Game Room flow; otherwise remove. |
| Competitive profile | `frontend/src/components/SkillProgressBar.tsx`, `RatingChangeAnimation.tsx` | Ancillary leaderboard/profile visuals | Delete or fold into the current profile/stats tabs if we need the effects. |
| Profile UX | `frontend/src/components/profile/EditableProfile.tsx`, `frontend/src/components/navigation/UserMenu.tsx` | Legacy profile edit form & dropdown | Remove; `ProfilePage` and the modern header already replace them. |
| Chat UX | `frontend/src/components/chat/MessageReactions.tsx`, `ReactionPicker.tsx` | Emoji reactions for chat messages | Implement reactions in the chat drawer (hook into socket events & persistence) or delete. |
| Game odds | `frontend/src/components/game/OddsPreviewCard.tsx` | Inline attack odds preview | Decide whether to show quick odds in the Game Room; wire it up via the combat preview logic or delete. |
| API clients | `frontend/src/services/typedApi.ts` | Alternate typed Axios wrapper | Delete after confirming nobody imports it; `services/api.ts` is the canonical client. |
| Leaderboards | `frontend/src/pages/LeaderboardsPage.tsx` | Standalone leaderboard screen | Delete; Community hub now owns leaderboards. |

## Detailed findings

### Audio controls
- `MuteButton` renders a floating mute/unmute toggle and manages hover tooltips.【F:frontend/src/components/MuteButton.tsx†L1-L82】 No other file references it anymore.【38ddae†L1-L3】
- The in-context control that replaced it lives in `GameRoomFooter`, which already toggles `audioService` for both desktop and mobile layouts.【F:frontend/src/components/game/GameRoomFooter.tsx†L1-L104】 Recommendation: remove `MuteButton.tsx` to avoid dead code.

### Map versioning & legacy map UI
- `MapVersionManager` still knows how to list, create, submit, and promote map versions against `/api/map-approval` endpoints.【F:frontend/src/components/MapVersionManager.tsx†L1-L185】 The backend routes are active today.【F:backend/src/routes/mapApproval.ts†L1-L200】 Nothing imports the component, so it never renders.【ce3898†L1-L2】 To revive it, mount the manager inside the map editor (authoring) or admin review flows and plumb in map IDs; otherwise plan a backend/API cleanup if we abandon per-version UX.
- `ResponsiveMapContainer` exposes the old zoom/pan context API, but our live map stack now uses `mapViewSlice` + `MapCanvas` with Redux-managed transforms.【F:frontend/src/components/ResponsiveMapContainer.tsx†L1-L200】【F:frontend/src/components/game/MapCanvas.tsx†L1-L118】 With no imports remaining,【85337c†L1-L4】 it is safe to delete along with the now-unused `useMapViewport` hook.
- `MapImageControls` offers tabbed helpers for scaling, resizing, and cropping map artwork.【F:frontend/src/components/MapImageControls.tsx†L1-L120】 Nothing imports it,【2eef9a†L1-L4】 and the current editor uses bespoke tool panels. Remove it unless we intentionally reincorporate those controls into the editor sidebar.

### Lobby & team management
- `TeamAssignment` implements drag-and-drop team balancing, including AI labels and auto-balance actions.【F:frontend/src/components/TeamAssignment.tsx†L1-L193】 No UI consumes it today,【34cd0e†L1-L5】 yet the backend still exposes `POST /rooms/:roomId/team-assignments`.【F:backend/src/routes/game.ts†L1-L22】【F:backend/src/controllers/gameController.ts†L192-L234】 Recommendation: embed the component inside the host tools on `LobbyPage` (e.g., when `allowTeamPlay` is true) so team games can be configured, or delete the component and associated API if manual teams are no longer supported.
- `GameLobby` is the original lobby list and create-room view.【F:frontend/src/pages/GameLobby.tsx†L1-L148】 `/lobby` now routes through the newer `LobbyPage` experience.【F:frontend/src/App.tsx†L438-L455】 Since nothing imports `GameLobby` anymore,【31cbc0†L1-L1】 remove the file to avoid confusing future contributors.

### Capital-mode helpers
 - `CapitalSelector`, `CapitalMarker`, `CapitalAttackWarning`, and `CapitalEliminationNotification` provide UI for capitals mode (selection UI, in-game crown markers, pre-attack warnings, and elimination callouts).【F:frontend/src/components/CapitalSelector.tsx†L1-L98】【F:frontend/src/components/CapitalMarker.tsx†L1-L68】【F:frontend/src/components/CapitalAttackWarning.tsx†L1-L59】【F:frontend/src/components/CapitalEliminationNotification.tsx†L1-L88】 None of these are referenced today.【4839d0†L1-L3】【c607b4†L1-L3】【92b7ff†L1-L4】【cf7d33†L1-L4】 Decide whether we still plan to surface capitals as a first-class mode. If so, wire the components into `ConquestKBoard` when the match config reports capitals; otherwise delete them alongside any dormant capital logic to reduce bundle weight.

### Competitive profile & ranking visuals
- `SkillProgressBar` renders tier progress given a rating.【F:frontend/src/components/SkillProgressBar.tsx†L1-L96】 and `RatingChangeAnimation` animates CP gains/losses.【F:frontend/src/components/RatingChangeAnimation.tsx†L1-L66】 They are not imported anywhere.【97eeba†L1-L4】【1b02d5†L1-L4】
- `LeaderboardsPage` is a standalone leaderboard screen built on `/api/skills/leaderboards/skill`.【F:frontend/src/pages/LeaderboardsPage.tsx†L1-L113】 The Community hub already consolidates leaderboard UI with tabbed sections over `/api/skills/leaderboards/skill`.【F:frontend/src/pages/CommunityPage.tsx†L1-L200】 No route still points at `LeaderboardsPage`.【466e26†L1-L2】 Remove it (and related links) to avoid duplicate navigation targets.

If we want to reuse any of these visuals (e.g., for celebratory rank-up experiences), embed them into the active `ProfilePage` tabs which already house player stats and match history.【F:frontend/src/components/ProfilePage.tsx†L240-L320】 Otherwise delete the files.

### Profile navigation & editing remnants
- `EditableProfile` performs profile updates with manual fetch calls and legacy auth token storage.【F:frontend/src/components/profile/EditableProfile.tsx†L1-L168】 It is not imported anywhere.【a9207c†L1-L2】 The new `ProfilePage` handles profile rendering, relationship controls, and bio editing via feature flags.【F:frontend/src/components/ProfilePage.tsx†L240-L320】 Remove the legacy editor to prevent divergence.
- `UserMenu` replicates an older account dropdown with inline stats loading.【F:frontend/src/components/navigation/UserMenu.tsx†L1-L197】 The current header implements its own authenticated user menu, notification badge logic, and logout handling.【F:frontend/src/components/Header.tsx†L320-L437】 No other file references `UserMenu`.【6895ce†L1-L3】 Delete it (and its unused styling hooks) to avoid double-maintenance.

### Chat reactions
- `MessageReactions` and `ReactionPicker` provide UI scaffolding for emoji reactions on chat messages.【F:frontend/src/components/chat/MessageReactions.tsx†L1-L47】【F:frontend/src/components/chat/ReactionPicker.tsx†L1-L62】 Neither is wired into the Inbox drawer or socket handlers today.【344a57†L1-L3】【a1f1c1†L1-L3】 Decide whether we want reactions before launch; if so, integrate them with chat persistence and socket events. If not, delete the components and any related TODOs.

### Game odds preview
- `OddsPreviewCard` estimates attacker/defender win odds and renders a floating tooltip.【F:frontend/src/components/game/OddsPreviewCard.tsx†L1-L72】 It is not used in the live Game Room.【48a0f6†L1-L4】 Either hook it into the combat preview logic (e.g., near `AttackOddsPopup`) or remove it.

### Alternate API client
- `typedApi.ts` implements a fully typed Axios client with custom error handling.【F:frontend/src/services/typedApi.ts†L1-L198】 No file imports `typedApi` today.【bbf949†L1-L2】 The app already centralizes HTTP configuration in `services/api.ts` with interceptors that align with current auth flows.【F:frontend/src/services/api.ts†L1-L55】 Recommendation: delete `typedApi.ts` (and any dead imports) to avoid confusion over which client to use.

## Next steps
1. Remove the files marked for deletion above (after double-checking no downstream packages import them via barrel files).
2. For the few candidates worth keeping (map version manager, team assignment, capital mode UI, chat reactions, odds preview), open focused tickets to either integrate them into the modern flows or consciously retire the supporting backend endpoints.
3. After deletions, run `npm run lint` / tests to ensure tree shaking catches any residual references before merging.
