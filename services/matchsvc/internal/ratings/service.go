package ratings

import (
    "context"
    "fmt"
    "time"
)

type Service struct {
    repo *Repo
}

func NewService(repo *Repo) *Service { return &Service{repo: repo} }

type GetRatingRequest struct {
    UserID string `json:"user_id"`
    Mode   string `json:"mode"`
}

type GetRatingResponse struct {
    Rating    int `json:"rating"`
    Deviation int `json:"deviation"`
}

type PlayerResult struct {
    UserID    string  `json:"user_id"`
    Placement int     `json:"placement"`
    Score     float64 `json:"score"`
}

type ReportResultRequest struct {
    ResultID string         `json:"result_id"`
    Mode     string         `json:"mode"`
    MatchID  string         `json:"match_id"`
    Players  []PlayerResult `json:"players"`
    TS       time.Time      `json:"ts"`
}

type ReportResultResponse struct {
    Updated []UpdatedRating `json:"updated"`
}

type UpdatedRating struct {
    UserID string `json:"user_id"`
    Rating int    `json:"rating"`
    Delta  int    `json:"delta"`
}

func (s *Service) GetRating(ctx context.Context, req GetRatingRequest) (any, int, error) {
    row, err := s.repo.GetRating(ctx, req.UserID, req.Mode)
    if err != nil {
        return nil, 500, err
    }
    return GetRatingResponse{Rating: row.Rating, Deviation: row.Deviation}, 200, nil
}

// Minimal placeholder: sets all players to default + 0 delta, ensuring idempotency.
func (s *Service) ReportResult(ctx context.Context, req ReportResultRequest) (any, int, error) {
    if req.ResultID == "" {
        return nil, 400, fmt.Errorf("result_id required")
    }
    ok, err := s.repo.InsertResultOnce(ctx, req.ResultID)
    if err != nil {
        return nil, 500, err
    }
    if !ok {
        return ReportResultResponse{Updated: []UpdatedRating{}}, 200, nil
    }
    updated := make([]UpdatedRating, 0, len(req.Players))
    for _, p := range req.Players {
        row, _ := s.repo.GetRating(ctx, p.UserID, req.Mode)
        // TODO: replace with proper multi-player ELO/Glicko update
        _ = s.repo.UpsertRating(ctx, p.UserID, req.Mode, row.Rating, row.Deviation)
        updated = append(updated, UpdatedRating{UserID: p.UserID, Rating: row.Rating, Delta: 0})
    }
    return ReportResultResponse{Updated: updated}, 200, nil
}

