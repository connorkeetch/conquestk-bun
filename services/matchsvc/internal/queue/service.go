package queue

import (
    "context"
    "crypto/rand"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "math/big"
    "time"

    "github.com/conquestk/matchsvc/pkg/config"
    "github.com/conquestk/matchsvc/pkg/metrics"
    "github.com/redis/go-redis/v9"
)

type EnqueueRequest struct {
    UserID   string   `json:"user_id"`
    Mode     string   `json:"mode"`
    PartyID  *string  `json:"party_id,omitempty"`
    Elo      *int     `json:"elo,omitempty"`
    TimeoutS *int     `json:"timeout_s,omitempty"`
    MapPrefs []string `json:"map_prefs,omitempty"`
}

type EnqueueResponse struct {
    TicketID string `json:"ticket_id"`
}

type DequeueRequest struct {
    TicketID string `json:"ticket_id"`
}

type PollRequest struct {
    TicketID string `json:"ticket_id"`
}

type PollResponse struct {
    Status   string   `json:"status"` // PENDING|FOUND|EXPIRED
    MatchID  *string  `json:"match_id,omitempty"`
    Players  []string `json:"players,omitempty"`
    Mode     string   `json:"mode,omitempty"`
}

type Service struct {
    rdb *redis.Client
    cfg config.Config
}

func NewService(rdb *redis.Client, cfg config.Config) *Service {
    return &Service{rdb: rdb, cfg: cfg}
}

type ticketDoc struct {
    ID       string   `json:"id"`
    UserID   string   `json:"userId"`
    Mode     string   `json:"mode"`
    Status   string   `json:"status"`
    PartyID  *string  `json:"partyId,omitempty"`
    Elo      *int     `json:"elo,omitempty"`
    Created  int64    `json:"created"`
    Timeout  int      `json:"timeout"`
    MatchID  *string  `json:"matchId,omitempty"`
    Players  []string `json:"players,omitempty"`
}

func bucketKey(mode string, elo *int) string {
    band := "any"
    if elo != nil {
        // 100-point bands
        lo := (*elo / 100) * 100
        hi := lo + 99
        band = fmt.Sprintf("%d-%d", lo, hi)
    }
    return fmt.Sprintf("lobby:queues:%s:%s", mode, band)
}

func ticketKey(id string) string { return fmt.Sprintf("ticket:%s", id) }
func matchKey(id string) string  { return fmt.Sprintf("match:%s", id) }

func randomID(n int) string {
    b := make([]byte, n)
    _, _ = rand.Read(b)
    return hex.EncodeToString(b)
}

func (s *Service) Enqueue(ctx context.Context, req EnqueueRequest) (any, int, error) {
    if req.UserID == "" || req.Mode == "" {
        return nil, 400, fmt.Errorf("user_id and mode required")
    }
    id := randomID(8)
    ttl := s.cfg.DefaultTicketTimeout
    if req.TimeoutS != nil && *req.TimeoutS > 0 {
        ttl = *req.TimeoutS
    }
    t := ticketDoc{
        ID: id, UserID: req.UserID, Mode: req.Mode, Status: "PENDING", PartyID: req.PartyID, Elo: req.Elo,
        Created: time.Now().Unix(), Timeout: ttl,
    }
    b, _ := json.Marshal(t)
    if err := s.rdb.Set(ctx, ticketKey(id), b, time.Duration(ttl)*time.Second).Err(); err != nil {
        return nil, 500, err
    }
    // Push to primary bucket
    if err := s.rdb.RPush(ctx, bucketKey(req.Mode, req.Elo), id).Err(); err != nil {
        return nil, 500, err
    }
    metrics.QueueDepth.WithLabelValues(req.Mode).Inc()
    return EnqueueResponse{TicketID: id}, 200, nil
}

func (s *Service) Dequeue(ctx context.Context, req DequeueRequest) (any, int, error) {
    if req.TicketID == "" {
        return nil, 400, fmt.Errorf("ticket_id required")
    }
    // Mark as cancelled; background janitor or matcher will ignore
    val, err := s.rdb.Get(ctx, ticketKey(req.TicketID)).Result()
    if err == redis.Nil {
        return map[string]string{"status": "gone"}, 200, nil
    }
    if err != nil {
        return nil, 500, err
    }
    var t ticketDoc
    _ = json.Unmarshal([]byte(val), &t)
    t.Status = "CANCELLED"
    b, _ := json.Marshal(t)
    _ = s.rdb.Set(ctx, ticketKey(req.TicketID), b, time.Until(time.Unix(t.Created+int64(t.Timeout), 0))).Err()
    return map[string]string{"status": "ok"}, 200, nil
}

func (s *Service) PollMatch(ctx context.Context, req PollRequest) (any, int, error) {
    if req.TicketID == "" {
        return nil, 400, fmt.Errorf("ticket_id required")
    }
    val, err := s.rdb.Get(ctx, ticketKey(req.TicketID)).Result()
    if err == redis.Nil {
        return PollResponse{Status: "EXPIRED"}, 200, nil
    }
    if err != nil {
        return nil, 500, err
    }
    var t ticketDoc
    if err := json.Unmarshal([]byte(val), &t); err != nil {
        return nil, 500, err
    }
    if t.Status == "FOUND" && t.MatchID != nil {
        return PollResponse{Status: "FOUND", MatchID: t.MatchID, Players: t.Players, Mode: t.Mode}, 200, nil
    }
    if t.Status == "CANCELLED" {
        return PollResponse{Status: "EXPIRED"}, 200, nil
    }
    return PollResponse{Status: "PENDING"}, 200, nil
}

// Matcher groups tickets into 2-player matches per mode (minimal viable) and publishes events.
type Matcher struct {
    rdb  *redis.Client
    qsvc *Service
    msvc MatchSaver
    cfg  config.Config
}

type MatchSaver interface {
    SaveMatch(ctx context.Context, mode string, players []string) (string, error)
}

func NewMatcher(rdb *redis.Client, qsvc *Service, msvc MatchSaver, cfg config.Config) *Matcher {
    return &Matcher{rdb: rdb, qsvc: qsvc, msvc: msvc, cfg: cfg}
}

func (m *Matcher) Run(ctx context.Context) {
    ticker := time.NewTicker(time.Duration(m.cfg.MatchLoopIntervalMS) * time.Millisecond)
    defer ticker.Stop()
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            m.tick(ctx)
        }
    }
}

func (m *Matcher) tick(ctx context.Context) {
    // Minimal: scan modes heuristically
    modes := []string{"normal", "capitals"}
    for _, mode := range modes {
        bucket := fmt.Sprintf("lobby:queues:%s:any", mode)
        // Try to pop two tickets with simple lock to avoid stampede
        t1 := m.pop(ctx, bucket)
        t2 := m.pop(ctx, bucket)
        if t1 == "" || t2 == "" {
            // push back if we popped one
            if t1 != "" {
                _ = m.rdb.LPush(ctx, bucket, t1).Err()
            }
            continue
        }
        // Form match
        matchID, err := m.msvc.SaveMatch(ctx, mode, []string{m.owner(ctx, t1), m.owner(ctx, t2)})
        if err != nil {
            // return tickets
            _ = m.rdb.LPush(ctx, bucket, t2).Err()
            _ = m.rdb.LPush(ctx, bucket, t1).Err()
            continue
        }
        // Update tickets
        m.setFound(ctx, t1, matchID, []string{m.owner(ctx, t1), m.owner(ctx, t2)})
        m.setFound(ctx, t2, matchID, []string{m.owner(ctx, t1), m.owner(ctx, t2)})
        metrics.MatchesFormedTotal.Inc()
        // Update depth
        // Best-effort: LLen
        if n, err := m.rdb.LLen(ctx, bucket).Result(); err == nil {
            metrics.QueueDepth.WithLabelValues(mode).Set(float64(n))
        }
    }
}

func (m *Matcher) pop(ctx context.Context, bucket string) string {
    // simple lock using BLPop timeout 1ms equivalent via script: use LPop
    id, err := m.rdb.LPop(ctx, bucket).Result()
    if err == redis.Nil || id == "" {
        return ""
    }
    if err != nil {
        return ""
    }
    // Validate ticket still pending and not expired
    val, err := m.rdb.Get(ctx, ticketKey(id)).Result()
    if err != nil {
        return ""
    }
    var t ticketDoc
    _ = json.Unmarshal([]byte(val), &t)
    if t.Status != "PENDING" || time.Unix(t.Created+int64(t.Timeout), 0).Before(time.Now()) {
        return ""
    }
    return id
}

func (m *Matcher) owner(ctx context.Context, ticketID string) string {
    val, err := m.rdb.Get(ctx, ticketKey(ticketID)).Result()
    if err != nil {
        return ""
    }
    var t ticketDoc
    _ = json.Unmarshal([]byte(val), &t)
    return t.UserID
}

func (m *Matcher) setFound(ctx context.Context, ticketID, matchID string, players []string) {
    val, err := m.rdb.Get(ctx, ticketKey(ticketID)).Result()
    if err != nil {
        return
    }
    var t ticketDoc
    _ = json.Unmarshal([]byte(val), &t)
    t.Status = "FOUND"
    t.MatchID = &matchID
    t.Players = players
    b, _ := json.Marshal(t)
    _ = m.rdb.Set(ctx, ticketKey(ticketID), b, time.Until(time.Unix(t.Created+int64(t.Timeout), 0))).Err()
}

// Helpers
func randomSeed() int64 {
    n, _ := rand.Int(rand.Reader, big.NewInt(1<<62))
    return n.Int64()
}
