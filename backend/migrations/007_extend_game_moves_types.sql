-- Extend allowed move types in game_moves to include 'transfer_conquest'
-- Never edit previous migrations; add a new one per repo guidelines.

ALTER TABLE game_moves
  DROP CONSTRAINT IF EXISTS game_moves_type_check;

ALTER TABLE game_moves
  ADD CONSTRAINT game_moves_type_check
  CHECK ((move_type)::text = ANY (
    ARRAY[
      'deploy'::text,
      'attack'::text,
      'fortify'::text,
      'end_turn'::text,
      'surrender'::text,
      'trade_cards'::text,
      'transfer_conquest'::text
    ]
  ));

