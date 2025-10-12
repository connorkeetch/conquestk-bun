package match

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/redis/go-redis/v9"
)

type Service struct {
    rdb *redis.Client
}

func NewService(rdb *redis.Client) *Service { return &Service{rdb: rdb} }

type MatchDoc struct {
    MatchID string   `json:"matchId"`
    Mode    string   `json:"mode"`
    Players []string `json:"players"`
    Seed    int64    `json:"seed"`
    Room    string   `json:"roomSuggestion"`
}

const eventsChannel = "matchsvc:events"

func (s *Service) SaveMatch(ctx context.Context, mode string, players []string) (string, error) {
    id := fmt.Sprintf("m_%d", time.Now().UnixNano())
    seed := time.Now().UnixNano() & 0x7FFFFFFF
    doc := MatchDoc{MatchID: id, Mode: mode, Players: players, Seed: int64(seed), Room: ""}
    b, _ := json.Marshal(doc)
    if err := s.rdb.Set(ctx, matchKey(id), b, 2*time.Minute).Err(); err != nil {
        return "", err
    }
    // publish
    payload := map[string]any{
        "type":    "match.found",
        "matchId": id,
        "mode":    mode,
        "players": players,
        "seed":    doc.Seed,
    }
    pb, _ := json.Marshal(payload)
    _ = s.rdb.Publish(ctx, eventsChannel, pb).Err()
    return id, nil
}

func (s *Service) GetMatch(ctx context.Context, id string) (any, int, error) {
    val, err := s.rdb.Get(ctx, matchKey(id)).Result()
    if err == redis.Nil {
        return map[string]string{"error": "not found"}, 404, nil
    }
    if err != nil {
        return nil, 500, err
    }
    var doc MatchDoc
    if err := json.Unmarshal([]byte(val), &doc); err != nil {
        return nil, 500, err
    }
    return doc, 200, nil
}

func matchKey(id string) string { return fmt.Sprintf("match:%s", id) }
