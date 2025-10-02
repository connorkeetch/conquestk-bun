# Post‑Game Analytics & Charts Plan

This plan defines how to turn persisted per‑turn stats (`game_states.turn_stats`) and the game log into clear, performant charts in the post‑game modal.

## Objectives
- Show how the game evolved (territories and armies per player across turns).
- Highlight eliminations and conquests for context.
- Keep rendering lightweight; no heavy charting dependencies.

## Data Sources
- turn_stats (canonical): appended at game start and after every endTurn.
  - Shape (one snapshot per append):
    - turn: number
    - phase: string
    - currentPlayerId: string
    - timestamp: ISO string
    - players: [{ id, territories, armies, eliminated }]
- game_log (context):
  - TURN START/END events
  - BATTLE events (conquests)
  - TREASURE events (optional annotation)

## Charts
- Territories over time (per player)
  - Type: line (players as series)
  - X: turn index; Y: territory count
  - Eliminations: draw a marker when a player’s series hits zero and `eliminated` is true.
- Armies over time (per player)
  - Type: line (players as series)
  - X: turn index; Y: total armies by player
- Optionally combine into a single panel with toggles: Territories | Armies
- Tooltip: turn number, player name, value; include timestamp from snapshot.
- Annotations (optional):
  - Conquests: small dot markers on the X axis; on hover, show `from → to` and attacker.
  - Treasure trades: diamond icon above the X axis.

## UI Placement
- GameOverModal: below “Final Standings” and above “Key Moments”.
- Compact legend with player color swatches.
- Toggle controls for series visibility and chart type.

## Performance Considerations
- N (turns) is small for real‑time games; JSON payload is small.
- Use plain SVG for lines/axes with simple helpers (no chart lib).
- Pre-compute series arrays once on modal open.

## Implementation Plan
1) Backend (already done)
   - Persist per‑turn stats in `game_states.turn_stats`.
   - Expose via `/game/rooms/:id/log` as `stats`.
2) Frontend data layer
   - Extend `gameService.getGameLog` to return `{ log, stats }` (done).
   - Build a `useTurnSeries(stats, players)` hook to compute series arrays.
3) Chart rendering
   - Add `PostGameCharts` component under `GameOverModal`.
   - Render two lightweight SVG line charts with shared X scale.
   - Add legend + visibility toggles per player.
4) Annotations
   - Map notable log entries (conquests) to turn indices; render small markers on the X axis.
5) Polish & a11y
   - ARIA labels on series; keyboard focusable legend toggles.
   - Reduce motion support: skip animation when `uiRoom.animationSpeed === 'instant'`.

## Risks & Mitigation
- Player count (6+) can clutter charts → add per‑series toggles and light smoothing (optional moving average).
- Divergent turn indices if snapshots are missing → use array index with fallback; label turns from 1..T.

## Next Steps
- Implement `PostGameCharts` with Territories + Armies tabs.
- Wire to `GameOverModal` with `{ log, stats }` from `getGameLog`. 
- Iterate labels and axes granularity once we see real game data.
