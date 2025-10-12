package config

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "io"
    "net/http"
    "os"
    "strings"
    "time"

    "github.com/conquestk/matchsvc/internal/match"
    "github.com/conquestk/matchsvc/internal/presence"
    "github.com/conquestk/matchsvc/internal/queue"
    "github.com/conquestk/matchsvc/internal/ratings"
    "github.com/rs/zerolog/log"
)

type Config struct {
    HTTPPort             string
    RedisURL             string
    DatabaseURL          string
    LogLevel             string
    HMACSecret           string
    DisableAuth          bool
    PprofEnabled         bool
    MatchLoopIntervalMS  int
    DefaultTicketTimeout int // seconds
}

func Load() Config {
    // Railway sets PORT; prefer MATCHSVC_PORT, then PORT, then 8085
    httpPort := os.Getenv("MATCHSVC_PORT")
    if httpPort == "" {
        httpPort = os.Getenv("PORT")
    }
    if httpPort == "" {
        httpPort = "8085"
    }
    cfg := Config{
        HTTPPort:             httpPort,
        RedisURL:             getenv("REDIS_URL", "redis://localhost:6379"),
        DatabaseURL:          getenv("DATABASE_URL", ""),
        LogLevel:             getenv("LOG_LEVEL", "info"),
        HMACSecret:           getenv("MATCHSVC_HMAC_SECRET", ""),
        DisableAuth:          getenv("MATCHSVC_DISABLE_AUTH", "false") == "true",
        PprofEnabled:         getenv("PPROF_ENABLED", "false") == "true",
        MatchLoopIntervalMS:  mustAtoi(getenv("MATCHSVC_MATCH_INTERVAL_MS", "250")),
        DefaultTicketTimeout: mustAtoi(getenv("MATCHSVC_DEFAULT_TICKET_TTL", "120")),
    }
    return cfg
}

func getenv(k, d string) string {
    if v := os.Getenv(k); v != "" {
        return v
    }
    return d
}

func mustAtoi(s string) int {
    var n int
    _, err := fmtSscanf(s, &n)
    if err != nil {
        return 0
    }
    return n
}

// Lightweight fmt.Sscanf alternative to avoid importing fmt in this package.
func fmtSscanf(s string, out *int) (int, error) {
    n := 0
    for i := 0; i < len(s); i++ {
        if s[i] < '0' || s[i] > '9' {
            return 0, io.EOF
        }
        n = n*10 + int(s[i]-'0')
    }
    *out = n
    return 1, nil
}

// HTTP server + routing with auth, health, and metrics.
func NewHTTPServer(mux *http.ServeMux, cfg Config, pres *presence.Service, qsvc *queue.Service, msvc *match.Service, rsvc *ratings.Service) http.Handler {
    mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("ok"))
    })
    mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
        // Basic readiness: if we can process a simple command, we're ready.
        // Defer deeper checks to metrics and logs.
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("ready"))
    })

    // Presence
    mux.Handle("/v1/presence/online", withAuth(cfg, jsonHandler(func(r *http.Request) (any, int, error) {
        var req presence.OnlineRequest
        if err := decodeJSON(r, &req); err != nil {
            return nil, http.StatusBadRequest, err
        }
        return pres.SetOnline(r.Context(), req)
    })))

    mux.Handle("/v1/presence/offline", withAuth(cfg, jsonHandler(func(r *http.Request) (any, int, error) {
        var req presence.OfflineRequest
        if err := decodeJSON(r, &req); err != nil {
            return nil, http.StatusBadRequest, err
        }
        return pres.SetOffline(r.Context(), req)
    })))

    mux.Handle("/v1/presence/move", withAuth(cfg, jsonHandler(func(r *http.Request) (any, int, error) {
        var req presence.MoveRequest
        if err := decodeJSON(r, &req); err != nil {
            return nil, http.StatusBadRequest, err
        }
        return pres.MoveUser(r.Context(), req)
    })))

    mux.HandleFunc("/v1/rooms/", func(w http.ResponseWriter, r *http.Request) {
        if !strings.HasPrefix(r.URL.Path, "/v1/rooms/") || !strings.HasSuffix(r.URL.Path, "/roster") {
            http.NotFound(w, r)
            return
        }
        roomID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v1/rooms/"), "/roster")
        resp, code, err := pres.GetRoomRoster(r.Context(), roomID)
        writeJSON(w, resp, code, err)
    })

    // Queue
    mux.Handle("/v1/queue/enqueue", withAuth(cfg, jsonHandler(func(r *http.Request) (any, int, error) {
        var req queue.EnqueueRequest
        if err := decodeJSON(r, &req); err != nil {
            return nil, http.StatusBadRequest, err
        }
        return qsvc.Enqueue(r.Context(), req)
    })))
    mux.Handle("/v1/queue/dequeue", withAuth(cfg, jsonHandler(func(r *http.Request) (any, int, error) {
        var req queue.DequeueRequest
        if err := decodeJSON(r, &req); err != nil {
            return nil, http.StatusBadRequest, err
        }
        return qsvc.Dequeue(r.Context(), req)
    })))
    mux.HandleFunc("/v1/queue/", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodGet {
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
            return
        }
        ticketID := strings.TrimPrefix(r.URL.Path, "/v1/queue/")
        resp, code, err := qsvc.PollMatch(r.Context(), queue.PollRequest{TicketID: ticketID})
        writeJSON(w, resp, code, err)
    })

    // Match
    mux.HandleFunc("/v1/match/", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodGet {
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
            return
        }
        matchID := strings.TrimPrefix(r.URL.Path, "/v1/match/")
        resp, code, err := msvc.GetMatch(r.Context(), matchID)
        writeJSON(w, resp, code, err)
    })

    // Ratings
    mux.HandleFunc("/v1/ratings/", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodGet {
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
            return
        }
        // /v1/ratings/{mode}/{userId}
        parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/v1/ratings/"), "/")
        if len(parts) != 2 || rsvc == nil {
            http.NotFound(w, r)
            return
        }
        mode, userID := parts[0], parts[1]
        resp, code, err := rsvc.GetRating(r.Context(), ratings.GetRatingRequest{UserID: userID, Mode: mode})
        writeJSON(w, resp, code, err)
    })
    mux.Handle("/v1/results", withAuth(cfg, jsonHandler(func(r *http.Request) (any, int, error) {
        if rsvc == nil {
            return map[string]string{"error": "ratings disabled"}, http.StatusNotImplemented, nil
        }
        var req ratings.ReportResultRequest
        if err := decodeJSON(r, &req); err != nil {
            return nil, http.StatusBadRequest, err
        }
        return rsvc.ReportResult(r.Context(), req)
    })))

    return withCommon(mux)
}

func withCommon(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        next.ServeHTTP(w, r)
    })
}

type handlerFunc func(r *http.Request) (any, int, error)

func jsonHandler(h handlerFunc) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        resp, code, err := h(r)
        writeJSON(w, resp, code, err)
    })
}

func writeJSON(w http.ResponseWriter, v any, code int, err error) {
    if err != nil {
        writeErr(w, code, err)
        return
    }
    w.WriteHeader(code)
    if v == nil {
        return
    }
    enc := json.NewEncoder(w)
    _ = enc.Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
    if code == 0 {
        code = http.StatusInternalServerError
    }
    w.WriteHeader(code)
    _ = json.NewEncoder(w).Encode(map[string]any{
        "error":   err.Error(),
        "status":  code,
        "ts":      time.Now().UTC().Format(time.RFC3339Nano),
        "request": "matchsvc",
    })
}

func decodeJSON(r *http.Request, v any) error {
    defer r.Body.Close()
    dec := json.NewDecoder(r.Body)
    dec.DisallowUnknownFields()
    return dec.Decode(v)
}

func withAuth(cfg Config, next http.Handler) http.Handler {
    if cfg.DisableAuth || cfg.HMACSecret == "" {
        return next
    }
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        sig := r.Header.Get("X-MatchSvc-Signature")
        if sig == "" {
            http.Error(w, "missing signature", http.StatusUnauthorized)
            return
        }
        body, err := io.ReadAll(r.Body)
        if err != nil {
            http.Error(w, "bad body", http.StatusBadRequest)
            return
        }
        r.Body = io.NopCloser(strings.NewReader(string(body)))
        mac := hmac.New(sha256.New, []byte(cfg.HMACSecret))
        mac.Write(body)
        expected := hex.EncodeToString(mac.Sum(nil))
        if !hmac.Equal([]byte(strings.ToLower(sig)), []byte(expected)) {
            http.Error(w, "invalid signature", http.StatusUnauthorized)
            return
        }
        next.ServeHTTP(w, r)
    })
}
