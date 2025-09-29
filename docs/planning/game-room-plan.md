# Game Room Plan

## Progress Tracker (Sept 29)

- Phase-driven HUD and bottom action bar
  - Added `frontend/src/components/game/GameActionBar.tsx` (sticky bottom). It surfaces phase-aware CTAs for Reinforcement (Place), Attack (Roll with 1/2/3 dice selector), and Fortify (Move slider). Wired to Redux actions; keeps side panel intact for now to avoid breaking flows. Next: unify with `GamePhaseControls` or remove the duplicate.
  - Follow-up: removed the legacy `GamePhaseControls` panel from the right rail and consolidated controls into the bottom bar to reduce mode errors.
- Turn timer
  - Added `frontend/src/components/game/TurnTimer.tsx`, driven by `room.turnExpiresAt` via lifecycle updates. Plays a subtle audio tick under 10s. No client auto-end; server remains source of truth. Time-bank UI not yet surfaced.
- Connection/resync UX
  - Added `frontend/src/components/game/ConnectionBanner.tsx` and socket connection status in `uiRoomSlice`. Header shows a (green/yellow/red) dot; a top banner appears while disconnected/connecting. “Resync” button not required yet since a fresh `game-update` arrives on reconnect; add if desync incidents appear.
- Clickable log → map focus
  - `GameLogPanel` now emits `onFocus([from,to])` for battle/fortify entries; `TabbedGameChat` plumbs this to `GameRoom`, which highlights the last territory. Pan/zoom-to-fit is not implemented; selection highlight acts as focus for now.
- Keyboard shortcuts
  - Added minimal bindings: `E`/`T` end turn. Numeric dice are set via UI in the action bar. More shortcuts remain TODO.
- Reduced motion
  - Introduced `uiRoomSlice.animationSpeed` and respected it in `BattleModal` (skip bounce, shorten auto-close when set to instant). UI toggle to be added in Settings.
- Attack odds + auto-attack
  - Displayed single-roll odds and expected losses in the bottom bar when a source/target is selected (computed via enumeration in `frontend/src/utils/odds.ts`).
  - Added an “Auto” button to repeat attacks until stop/conquest/insufficient armies. Persisted “commit on conquer” input; we pass the commit via socket so backend moves that many when conquering.
- Post-conquest transfer preference
  - Added “Commit on conquer” numeric input in the Attack phase (default 1, persisted) which is included with the attack action; backend uses it for post-conquest move.
- Color-blind palette & labels
  - Planned. No palette swap yet; army labels already sit on high-contrast tokens. Will add a color-blind toggle and variable set in a later pass.
- Spectators & AFK → bot
  - Spectate is supported via `?spectate=true`. AFK→bot replacement remains server-driven; no UI added in this pass.
- Store shape for transient UI
  - Added `frontend/src/store/uiRoomSlice.ts` for dice, overlays, animation speed, hover/selection mirror, and connection status. Existing selection in `gameSlice` remains; we’ll migrate gradually.
- Header
  - `GameHeader` shows a phase chip, turn number, a compact timer, and a live connection dot. Map remains the hero.

Notes

- Socket handlers live at `backend/src/services/socketService.ts` in this repo (not `backend/src/socket/gameHandlers.ts`). Keep the plan’s intent but mind the path.
- We intentionally didn’t restructure the right rail yet. Chat+log already exist; the bottom action bar was the biggest UX win with minimal risk.

Next Steps (suggested)

- Add odds tooltip on attack hover + quick “auto-attack” option.
- Add inline transfer slider post-conquest (visual inline slider near border); current MVP uses a numeric "commit on conquer" input in the action bar.
- Surface time bank UI alongside the timer when configured; reflect server deltas.
- Implement pan/zoom focus to selected territories from log clicks (ResponsiveMapContainer hook).
- Consolidate `CurrentActionPanel` details into the bottom bar (now that phase controls are moved) and reduce right-rail redundancy.


## 0. The One‑Screen Mental Model

If a player can’t tell “where am I, whose turn is it, what can I do next?” in 3 seconds, you lose them.

### Desktop Layout

- Top bar: room name, match ID, phase chip (Draft, Attack, Fortify), turn timer with time bank, connection status, settings.
- Center stage: the map is always the hero. Zoom/pan with scroll + drag. Territories are big tap targets, cluster labels avoid overlaps, and ownership is readable without tooltips.
- Left rail: players list with turn order, color swatches, armies, cards, resign/replace bot, and tiny “speaking” indicators.
- Right rail (collapsible): event log and chat with tabs. Diplomatic pings live here too.
- Bottom action bar: primary action changes by phase (Place, Attack, Fortify). Secondary actions: undo last placement (within turn), end phase/turn, cards, trade info, probabilities.

### Mobile Layout

- Map is full‑bleed.
- A phase action FAB floats bottom‑right. A bottom drawer swaps between action controls and the log/chat.
- Swipe left/right switches between map filters (ownership, attackable, continent bonus overlay).
- Top mini‑HUD shows current player, timer, and phase. Tap to expand to the full sidebar.

## 1. Lobby Inside the Room

- The “room” isn’t just the map; it’s also the pre‑match staging.
- Seat selection with clear colors and lock‑in. Show continent bonuses on hover even before start.
- Private/public, invite code, and “Ready” state with host controls (kick, swap seats, set timer, toggle fog, card rules).
- Countdown starts when all Ready (or host forces start). If someone drops in countdown, auto‑pause.

### Implementation Notes

- Keep lobby and live game under one route and store slice. Don’t remount the room on start; phase changes should transition the HUD, not rebuild the world.
- Reuse existing Redux Toolkit slice patterns and Tailwind theme variables.

## 2. Phase‑Driven UI (Reduce Mode Errors)

Your game should feel like a guided story, not a spreadsheet. Only show what matters in the current phase.

### Draft Phase

- Reinforcement counter top‑center. Territories you own glow subtly. Legal drop targets pulse.
- Click territory increments by 1; Shift‑click opens a numeric input. Undo stack for misclicks.

### Attack Phase

- Clicking your territory highlights valid targets with arrows. Hover shows odds (attacker vs defender dice).
- Primary CTA: “Roll.” Secondary: set dice count and “Auto attack until X difference” for grinders.
- After battle, a transfer slider appears inline at the border. Default to min 1, remember last used.

### Fortify Phase

- Show a network overlay of connected territories. Invalid endpoints are disabled, not error‑y.

### End Turn

- One button. Confirm if you still have unspent reinforcements or fortify moves (gentle nudge, not nag).

## 3. Map Interactions That Don’t Suck

- Selection model: one selected “source” territory at a time. Escape clears selection. Right‑click opens a compact context menu: Place, Attack, Fortify, Info.
- Zoom/pan: mouse wheel zoom centered on pointer. Touch pinch zoom. Double‑tap to zoom in.
- Labels: always legible. Use dynamic text scaling and halo strokes so army counts are visible over any color.
- Color system: owner colors meet WCAG AA over the terrain. Provide a color‑blind palette toggle in Settings. Theme switching already relies on CSS variables; extend those tokens for player colors.
- Overlays: toggleable layers for continents, attackable adjacency, and “threat heatmap” (enemy pressure).

## 4. Combat Resolution That Feels Fair

- Before roll: show odds and expected losses. Small tooltip: “≈ 62% win chance, E[L]=1.8.”
- During roll: quick, punchy animation under 700 ms. Respect “reduced animation” preference.
- After roll: inline, readable summary in the log: “Red attacked Egypt from North Africa (3v2): Red lost 1, Blue lost 2.”
- Speed controls: normal, fast, instant. Persist per player.

## 5. Turn Timer That Doesn’t Punish Honest Humans

- Base per‑turn time (e.g., 60 s) plus a time bank players can dip into.
- Audible tick at 10 s and color shift of the timer ring.
- Auto‑end phase with best effort: place remaining reinforcements evenly, cancel pending attacks, end turn.
- AFK handling: two timeouts in a row offers “Replace with bot” to others. Host can set a grace count.

## 6. Log, Chat, Pings, Diplomacy

- Event log is authoritative history, filterable by me/others/system. Click a log entry to focus the map on the involved territories.
- Chat is separate from the log. Don’t mix them. Add quick‑pings: double‑tap a territory to drop a ping others can click to zoom to.
- Manners: profanity toggle, mute player, and a “Report” action in the player list.

## 7. Cards and Set Trades (If Enabled)

- Hand preview chip in the bottom bar with count and glow when a set is ready.
- Trade modal shows all valid sets, projected reinforcements, and a “trade and auto‑place evenly” one‑click.

## 8. Spectators and Rejoin

- Spectators see everything unless Fog of War is on. Mark them clearly in the players list.
- Reconnect flow: optimistic countdown overlay “Reconnecting… 3, 2, 1” with an action to try now. On resume, replay missed events quickly from the log so the map state catches up.
- If a player disconnects during combat, resolve server‑side and post the result to the log. The client should never be the source of truth here.

## 9. Accessibility Without Excuses

- Full keyboard path: Tab cycles visible controls; arrow keys nudge map; Enter confirms; Space opens the context menu for the selected territory; 1/2/3 set dice count.
- Skip animations setting, reduced motion by OS preference, and adjustable text size.
- Screen‑reader basics: announce phase changes, current player, and timer updates (“20 seconds remaining” at defined intervals).
- Colors and contrast tested on the 8 common color‑vision variants.

## 10. Performance and Reliability

- Use optimistic UI for lightweight actions (placing reinforcements) and server‑confirmed UI for contested actions (attacks, fortify). If an attack conflicts, roll back with a toast and a log entry.
- Socket hygiene: identify users and rooms, heartbeat, and exponential backoff reconnect. Show a tiny status dot in the header (green, yellow, red) so people stop asking “is it lagging or is it me.” Wire these against your Socket.io layer and shared types; keep handlers aligned with `backend/src/socket/gameHandlers.ts`.
- Render only what’s visible. If you’re using SVG, keep armies and labels in one layer and territories in another; avoid re‑painting the entire map when a single number changes.
- Persist small UI state in localStorage (zoom, animation speed, muted players) and game state in Redux with slices for room, players, map, chat, and UI. Extend your existing Redux Toolkit patterns.

## 11. Sounds That Add Feedback, Not Headaches

- Three categories with independent volume: actions, rolls, alerts.
- Respect “mute background” and “mute all” toggles. Short, distinctive start‑of‑turn chime.

## 12. New Player Onboarding

- First game: a 60‑second “tap to learn” overlay that only highlights the three phases, how to attack, and where the timer lives. Nothing else. Show it again only if the player abandons two games early.

## 13. Post‑Game That Teaches

- MVP: results modal with graph of armies over time, eliminations, and “Play again” plus “Rematch same seats.”
- Stretch: key moments timeline players can click to jump through a quick replay.

## 14. What the UI Should Literally Look Like

- Keep it spartan and readable. You have Tailwind v4 and a theme system based on CSS variables, so push tokens not inline styles.
- Phase chip: small rounded pill, color by phase. Example: `class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-surface-2 text-ink-2"` (swap `bg-*` via `[data-theme]` tokens).
- Action bar: sticky bottom container with primary button that changes label by phase. Example: `class="fixed inset-x-0 bottom-0 mx-auto max-w-[1200px] p-2 backdrop-blur supports-[backdrop-filter]:bg-surface-1/80"`
- Territory hover: cursor pointer, subtle inner glow, not neon toothpaste.
- Theme toggling relies on `data-theme` attributes per your convention. Don’t inline‑style your way into maintenance debt.

## 15. Input and Hotkeys (Defaults That Won’t Surprise)

- A Attack, F Fortify, D Draft (or cycle phases when allowed).
- 1/2/3 set dice. E end phase, T end turn. Z undo placement.
- G toggle continent overlay, H toggle threat heatmap, L focus last log event.

## 16. Minimal Data Shapes That Will Save You Pain

Use shared types under `shared/` so frontend and backend agree on reality.

```ts
// shared/types/game.ts
export type Phase = 'draft' | 'attack' | 'fortify'
export type PlayerID = string
export type TerritoryID = string

export interface RoomState {
  roomId: string
  seed: number
  mapId: string
  phase: Phase
  currentPlayer: PlayerID
  turnEndsAt: number // epoch ms
  players: Record<PlayerID, PlayerSummary>
  territories: Record<TerritoryID, TerritoryState>
  // transient UI hints never live here
}

export interface ClientEvent {
  type:
    | 'place'
    | 'attack:start'
    | 'attack:resolve' // server only
    | 'fortify'
    | 'endPhase'
    | 'endTurn'
  payload: unknown
  clientMsgId?: string
}

export interface ServerEvent {
  seq: number
  type:
    | 'room:update'
    | 'combat:resolved'
    | 'player:joined'
    | 'timer:update'
    | 'chat:message'
  payload: unknown
}
```

In the UI slice, keep a transient selection model:

```ts
// frontend/src/store/uiRoomSlice.ts
export interface UIRoomState {
  selectedTerritory: TerritoryID | null
  highlightTargets: TerritoryID[]
  hoverTerritory: TerritoryID | null
  dice: 3
  animationSpeed: 'normal' | 'fast' | 'instant'
  overlays: { continents: boolean; attackable: boolean; threat: boolean }
}
```

This separation keeps socket snapshots clean while the UI can glow and wiggle to its heart’s content.

## 17. Error and Empty States You’ll Actually Hit

- No territories selected: grey microcopy in the action bar, “Select a territory to begin your move.”
- Illegal action: shake the button once and explain why in plain language. Don’t modal it.
- Desync detected: banner with “Resync state” that requests a full snapshot from the server.

## 18. Analytics That Don’t Creep but Do Help

- Time to first action after your turn starts.
- % of turns ending due to timeout.
- Average actions per phase.
- Undo usage (if it’s high, placement flow is annoying).
- Rage indicators: chat toxicity flags, resign on a big loss, instant leave after a bad roll.

## 19. QA Checklist That Will Save Your Weekend

- Can two players attempt the same attack at the exact same time without ghosting the UI?
- Reconnect mid‑combat and mid‑transfer.
- Timer bank edge cases on trade animations.
- Mobile one‑handed reach for End Turn and Roll.
- Color‑blind mode across six maps.
- Slow 3G and forced socket drops.

## 20. Prioritized “Just Ship It” List

- Phase‑driven HUD and bottom action bar with clear CTAs.
- Attack flow with valid target highlight, odds tooltip, fast roll animation, and transfer slider.
- Event log that’s clickable and map‑focusing.
- Turn timer with time bank and auto‑end behavior.
- Reconnect banner and resync.
- Keyboard shortcuts and reduced motion toggle.
- Color‑blind palette and readable army labels.
- Spectator mode and bot replacement for AFK.

Get those eight right and the room will feel tight even before you add fancy overlays. Then you can mess around with replays and heatmaps like a proud goblin.
