package logging

import (
    "os"
    "strings"
    "time"

    "github.com/rs/zerolog"
    "github.com/rs/zerolog/log"
)

func Configure(level string) {
    // Human-friendly console in dev; JSON otherwise
    console := strings.ToLower(os.Getenv("ENV")) != "production"
    var logger zerolog.Logger
    if console {
        writer := zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}
        logger = zerolog.New(writer).With().Timestamp().Logger()
    } else {
        logger = zerolog.New(os.Stdout).With().Timestamp().Logger()
    }
    log.Logger = logger
    lvl, err := zerolog.ParseLevel(level)
    if err != nil {
        lvl = zerolog.InfoLevel
    }
    zerolog.SetGlobalLevel(lvl)
}

