# Player Stats Smoke Test

Use this checklist whenever the stats aggregation or profile surfaces change.

## Pre-requisites
- Local environment running `npm run dev:quick` (frontend + backend).
- Seeded database or at least one test user that can start and finish matches.
- Access to the SQL console for running quick sanity queries (`cd backend && npm run db:psql`).

## Steps
1. **Start and complete a match**
   - Log in with a test account.
   - From `/play/casual`, create a quick lobby and complete a game (AI can be added to accelerate).
   - When possible, execute at least one card trade so a `trade_cards` move is recorded.
2. **Verify persistence**
   - In psql, confirm the game completion wrote rows:
     ```sql
     SELECT territories, armies, is_winner
     FROM player_game_results
     WHERE user_id = '<TEST_USER_ID>'
     ORDER BY created_at DESC
     LIMIT 1;
     ```
   - Inspect the aggregated table:
     ```sql
     SELECT games_played, games_won, total_eliminations, total_territories_conquered,
            longest_win_streak, current_win_streak
     FROM player_stats
     WHERE user_id = '<TEST_USER_ID>';
     ```
   - Check card trade accounting (if an in-game trade occurred):
     ```sql
     SELECT COUNT(*) AS trade_count,
            SUM(CASE
                  WHEN move_data ? 'cards' AND jsonb_typeof(move_data->'cards') = 'array'
                    THEN jsonb_array_length(move_data->'cards')
                  WHEN move_data ? 'cardIds' AND jsonb_typeof(move_data->'cardIds') = 'array'
                    THEN jsonb_array_length(move_data->'cardIds')
                  WHEN move_data ? 'cardCount' AND (move_data->>'cardCount') ~ '^[0-9]+$'
                    THEN (move_data->>'cardCount')::int
                  ELSE 0
                END) AS cards_redeemed
     FROM game_moves
     WHERE player_id = '<TEST_USER_ID>' AND move_type = 'trade_cards';
     ```
3. **UI validation**
   - Refresh `/profile/<username>` and switch to the **Statistics** tab.
     - Games played / wins / losses should reflect the match you just completed.
     - "Territory Mastery" should show the max territories returned from `player_game_results`.
     - "Card Trades" should increment when a trade was executed.
   - Visit `/profile/stats` to ensure the dedicated analytics route renders the same data without refetch errors.
   - Open the header user menu; the mini-summary should show updated wins and win rate.
4. **Timeline sanity**
   - On `/profile/stats`, scroll to *Last 90 Days* and confirm the most recent date matches the game you played.
   - If no new rows appear, re-run the SQL above to confirm data landed, then file an issue.

## Expected outcome
- Database tables (`player_stats`, `player_game_results`, `game_results`, `game_moves`) all reflect the match.
- UI cards and charts display the new totals without manually refreshing the token.
- No errors in browser console or backend logs.

