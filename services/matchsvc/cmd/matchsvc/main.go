package main

import (
    "context"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/conquestk/matchsvc/internal/match"
    "github.com/conquestk/matchsvc/internal/presence"
    "github.com/conquestk/matchsvc/internal/queue"
    "github.com/conquestk/matchsvc/internal/ratings"
    "github.com/conquestk/matchsvc/pkg/config"
    "github.com/conquestk/matchsvc/pkg/logging"
    "github.com/conquestk/matchsvc/pkg/metrics"
    redispkg "github.com/conquestk/matchsvc/pkg/redis"
    transport "github.com/conquestk/matchsvc/transport"
    "github.com/rs/zerolog/log"
)

func main() {
    cfg := config.Load()
    logging.Configure(cfg.LogLevel)

    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
    defer stop()

    rdb := redispkg.MustNew(ctx, cfg)
    defer func() { _ = rdb.Close() }()

    var ratingsRepo *ratings.Repo
    if cfg.DatabaseURL != "" {
        repo, err := ratings.NewRepo(ctx, cfg.DatabaseURL)
        if err != nil {
            log.Fatal().Err(err).Msg("failed to connect to postgres")
        }
        ratingsRepo = repo
        defer ratingsRepo.Close()
    }

    // Services
    pres := presence.NewService(rdb)
    qsvc := queue.NewService(rdb, cfg.DefaultTicketTimeout)
    msvc := match.NewService(rdb)
    var rsvc *ratings.Service
    if ratingsRepo != nil {
        rsvc = ratings.NewService(ratingsRepo)
    }

    // Start background matcher
    matcher := queue.NewMatcher(rdb, qsvc, msvc, cfg.MatchLoopIntervalMS)
    go matcher.Run(ctx)

    mux := http.NewServeMux()
    metrics.Register(mux)
    transport := transport.NewHTTPServer(mux, cfg, pres, qsvc, msvc, rsvc)

    srv := &http.Server{
        Addr:              ":" + cfg.HTTPPort,
        Handler:           transport,
        ReadHeaderTimeout: 5 * time.Second,
    }

    go func() {
        log.Info().Str("addr", srv.Addr).Msg("matchsvc listening")
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatal().Err(err).Msg("http server error")
        }
    }()

    <-ctx.Done()
    log.Info().Msg("shutting down...")
    shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    _ = srv.Shutdown(shutdownCtx)
    // allow matcher to drain via ctx cancellation
    time.Sleep(200 * time.Millisecond)
    // Flush logs
    _ = log.Logger
    _ = os.Stdout.Sync()
}
