package config

import (
    "io"
    "os"
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

// No-op to avoid importing fmt; used by mustAtoi
var _ io.Reader
