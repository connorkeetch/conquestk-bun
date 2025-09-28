# Hidden Treasures Ruleset

Last updated: January 2026

Hidden Treasures is ConquestK’s treasure set system. Players draw treasures on conquest, collect sets, and trade them for troop reinforcements.

Key concepts
- Draws on conquest: When a player conquers at least one territory during their turn, they draw one treasure.
- Metals: bronze, silver, gold, diamond. Diamonds are rarer and enable special sets.
- Redeemable sets (3 cards):
  - Three of a kind (bronze/silver/gold)
  - One of each (bronze + silver + gold)
  - Diamond combo (any three that include at least one diamond)
- Forced cash-in: Hands at or above the configured hand limit must redeem before attacking again.

Configuration
- Enable/disable: Choose a payout mode. Any mode except “Disabled” enables Hidden Treasures; “Disabled” turns it off.
- Diamond chance: Fixed at 8% (engine default and room config).
- Payout mode:
  - Progressive (triangular growth): 4, 6, 9, 13, 18, … (increasing gaps)
  - Classic: 4, 6, 8, 10, 12, 15, 20, 25, 30, 35, then +5 per set
  - Fixed: Constant value (1..50)
  - Disabled: Sets redeem for 0 troops
- Diamond set bonus: Fixed at +3 troops when a redeemed set contains a diamond.
- Hand limit: Fixed at 5 cards (forced cash-in at or above 5).

Where to configure
- Create Game page → “Hidden Treasures” section lets hosts select the payout mode (including Disabled) and adjust the fixed payout value when applicable.
- Backend caches the selected `treasureConfig` at room creation and applies it at game start.

Engine behavior
- Source: `backend/src/game/hiddenTreasures.ts` provides helper functions for draws, set validation, payouts, and state updates.
- Integration: `GameEngine` wires conquest draws, forced cash-in checks, elimination transfers, and trade_cards handling.
- Metrics: Draw/cash/mode counters are recorded in `metricsService.ts`.

Validation & tests
- Backend unit tests live at `backend/src/test/hiddenTreasures.test.ts` covering normalization, draws, set patterns, payouts, and disabled mode.

Notes & limitations
- Room-level persistence uses a cache bridge; for very long-lived lobbies or process restarts, consider persisting `treasureConfig` in the DB (e.g., a JSONB settings column).
- The current frontend does not yet include an in-game “Treasure Hand” UI or a “Redeem Set” panel; the server endpoints and engine logic are ready for those actions.
