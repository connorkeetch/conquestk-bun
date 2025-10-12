package redis

import (
    "context"
    "strings"

    "github.com/conquestk/matchsvc/pkg/config"
    goredis "github.com/go-redis/redis/v9"
)

func MustNew(ctx context.Context, cfg config.Config) *goredis.Client {
    opt, err := goredis.ParseURL(cfg.RedisURL)
    if err != nil {
        // Allow bare host:port
        if !strings.HasPrefix(cfg.RedisURL, "redis://") {
            opt, err = goredis.ParseURL("redis://" + cfg.RedisURL)
        }
        if err != nil {
            panic(err)
        }
    }
    client := goredis.NewClient(opt)
    if err := client.Ping(ctx).Err(); err != nil {
        panic(err)
    }
    return client
}

