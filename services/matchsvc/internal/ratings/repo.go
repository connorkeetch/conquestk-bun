package ratings

import (
    "context"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
)

type Repo struct {
    pool *pgxpool.Pool
}

func NewRepo(ctx context.Context, dsn string) (*Repo, error) {
    pool, err := pgxpool.New(ctx, dsn)
    if err != nil {
        return nil, err
    }
    // Migrations are out of scope; assume tables exist
    return &Repo{pool: pool}, nil
}

func (r *Repo) Close() { r.pool.Close() }

type RatingRow struct {
    PlayerID string
    Mode     string
    Rating   int
    Deviation int
    UpdatedAt time.Time
}

func (r *Repo) GetRating(ctx context.Context, userID, mode string) (RatingRow, error) {
    var row RatingRow
    err := r.pool.QueryRow(ctx, `
        SELECT player_id, mode, rating, deviation, updated_at
        FROM players_ratings
        WHERE player_id=$1 AND mode=$2
    `, userID, mode).Scan(&row.PlayerID, &row.Mode, &row.Rating, &row.Deviation, &row.UpdatedAt)
    if err != nil {
        // default
        return RatingRow{PlayerID: userID, Mode: mode, Rating: 1200, Deviation: 350, UpdatedAt: time.Now()}, nil
    }
    return row, nil
}

func (r *Repo) UpsertRating(ctx context.Context, userID, mode string, rating, deviation int) error {
    _, err := r.pool.Exec(ctx, `
        INSERT INTO players_ratings(player_id, mode, rating, deviation, updated_at)
        VALUES ($1,$2,$3,$4,NOW())
        ON CONFLICT (player_id, mode)
        DO UPDATE SET rating=EXCLUDED.rating, deviation=EXCLUDED.deviation, updated_at=NOW()
    `, userID, mode, rating, deviation)
    return err
}

func (r *Repo) InsertResultOnce(ctx context.Context, resultID string) (bool, error) {
    ct, err := r.pool.Exec(ctx, `
        INSERT INTO results_idempotency(result_id, created_at)
        VALUES ($1, NOW())
        ON CONFLICT DO NOTHING
    `, resultID)
    if err != nil {
        return false, err
    }
    return ct.RowsAffected() == 1, nil
}

