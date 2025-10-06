# Orphaned code and assets audit (March 2025)

## Summary
- Re-ran the orphaned code sweep to reflect the refactored Lobby/Game Room stacks.
- Identified frontend components, hooks, and one backend data file that no longer have import sites.
- Captured concrete next steps so we can either wire the assets back into the live flows or delete them with confidence.

## Quick reference table
| Area | Artifact | Observed role | Recommendation |
| --- | --- | --- | --- |
| Capital mode UI | `CapitalSelector.tsx`, `CapitalMarker.tsx`, `CapitalAttackWarning.tsx`, `CapitalEliminationNotification.tsx` | Capitals selection, crown marker, and modal warnings for the capitals game mode | Decide whether capitals is still a launch feature. If yes, embed these pieces into the modern Game Room flow when `gameConfig.mode === 'capitals'`. Otherwise delete them (and the dead capital-specific reducers) to shed bundle weight. |
| Map tooling | `MapVersionManager.tsx` | Full CRUD UI for map versions against `/api/map-approval` | Either mount it inside the authoring/admin tools (e.g. Map Editor sidebar) or retire it alongside any unused backend endpoints. |
| Auth routing | `ProtectedRoute.tsx` | Legacy auth-only route guard | Replace remaining usages with `AuthGuard` or delete the file now that `App.tsx` only references the newer guard. |
| Competitive visuals | `RatingChangeAnimation.tsx`, `SkillProgressBar.tsx` | Animated CP delta toast + tier progress meter | Decide whether to surface them inside `ProfilePage` or ranked win modals. If no concrete placement, delete to reduce maintenance. |
| Lobby teams | `TeamAssignment.tsx` | Drag-and-drop team balancer for hosts | Wire it into the host drawer on `LobbyPage` when `allowTeamPlay` is true so manual team setups work again, or remove it together with the unused `/rooms/:id/team-assignments` flow. |
| Chat UX | `chat/MessageReactions.tsx`, `chat/ReactionPicker.tsx` | Emoji reactions picker and pill list | Implement reactions in the Inbox/chat drawer (hook into socket + persistence) or delete the scaffolding. |
| Game Room sidebars | `game/ConquestArmyTransferModal.tsx`, `ContinentControlPanel.tsx`, `CurrentActionPanel.tsx`, `GameActionPanel.tsx`, `PlayersLegend.tsx`, `PlayersPanel.tsx`, `TerritoryInfoPanel.tsx` | Legacy panels/modals that surfaced current action, territory details, continent bonuses, and transfer flow | Audit the current `GameRoom` UX to see which affordances are still missing. Re-introduce only the valuable bits (e.g. continent bonuses) using the new panel framework; delete the rest to avoid regressions. |
| Hooks | `useTerritorySelection.ts` | Helper that wrapped selection + hover dispatching | Either re-home it inside the modern `RiskGameBoard` once hover highlights are restored, or remove it if the Redux slice now handles everything inline. |
| Admin maps | `pages/AdminMapReviews.tsx` | Alternate review queue dashboard | Confirm nobody still relies on this route (only `AdminMapReview` is linked). Delete once verified to avoid confusing admins. |
| Backend data | `backend/src/data/defaultMaps.ts` | Hard-coded sample maps for dev testing | Retire it if our map loader now depends exclusively on DB records/fixtures; otherwise move the seed data into a migration or test fixture so it is actually used. |

## Detailed notes
### Capital mode helpers
The four capital-related components still render the crown marker, attack warning modal, elimination toast, and host selection grid, but nothing imports them after the Game Room revamp. Wire them back in behind a `capitals` feature flag or delete the entire set once we confirm the mode is postponed.

### Map version manager
`MapVersionManager` drives listing, promotion, and creation of map versions against the live approval API, yet it is never mounted. If the authoring workflow still needs version management, embed it inside the Map Editor/Admin map review views; otherwise, plan a cleanup of the redundant routes so the UI and backend stay in sync.

### Routing guards
`ProtectedRoute` is a simplified wrapper that redirects unauthenticated users to `/login`. `App.tsx` now uses `AuthGuard`/`VerificationGuard` everywhere, so the legacy guard can be dropped once you confirm there are no out-of-tree imports (Storybook, etc.).

### Ranked/competitive UI widgets
The rating animation toast and skill progress bar are left over from an earlier leaderboard/profile pass. Either drop them into the existing `ProfilePage` tabs or purge them to keep the bundle lean.

### Team assignment UX
`TeamAssignment` still contains the drag-and-drop UI for manually forming teams. It should either live inside the Lobby host controls when `allowTeamPlay` is true or be deleted if the product direction has moved to automatic teams only.

### Chat reactions
`MessageReactions` and `ReactionPicker` provide a complete reaction UX (picker, pill list, toggling). Implementing the socket + persistence glue would bring them to life; otherwise delete them so contributors do not assume reactions already exist.

### Legacy Game Room panels
Several memoized panels/modals (`ConquestArmyTransferModal`, `ContinentControlPanel`, `CurrentActionPanel`, `GameActionPanel`, `PlayersLegend`, `PlayersPanel`, `TerritoryInfoPanel`) live beside the modern `RiskGameBoard` but are not referenced. Compare their capabilities with what the current drawers and overlays provide, then either port the missing affordances or remove the redundant files.

### Territory selection hook
`useTerritorySelection` wraps Redux selectors and hover dispatching. `RiskGameBoard` now performs those calls inline, so the hook can likely be deleted unless we plan to re-extract hover logic for reuse.

### Admin map review page
`AdminMapReviews` still fetches the approval queue, but `App.tsx` only routes to `AdminMapReview` (singular) and `AdminMaps`. Confirm nobody deep-links to the plural version before deleting.

### Backend default maps
`backend/src/data/defaultMaps.ts` exports two static map definitions that nothing imports. If manual testing still needs a canned map, move this data into a seed script; otherwise delete the file so it does not drift from the real schema.

## Next steps
1. Decide which of the above features we intend to ship before launch versus which can be cut, then remove all dead files in a single cleanup PR (remember to touch `CLAUDE.md`/`AGENTS.md` if guidance changes).
2. For any feature we keep, open targeted tickets outlining the integration points (e.g. capital mode gating, lobby team assignment, chat reactions) and ensure backend/socket flows match.
3. After deleting or wiring in the components, run `npm run lint` and the relevant Jest/Vitest suites to catch lingering imports.
