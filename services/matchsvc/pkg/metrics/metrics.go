package metrics

import (
    "net/http"

    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
    QueueDepth = prometheus.NewGaugeVec(prometheus.GaugeOpts{
        Name: "matchsvc_queue_depth",
        Help: "Current queue depth per mode",
    }, []string{"mode"})

    MatchesFormedTotal = prometheus.NewCounter(prometheus.CounterOpts{
        Name: "matchsvc_matches_formed_total",
        Help: "Total matches formed",
    })

    PresenceOnline = prometheus.NewGauge(prometheus.GaugeOpts{
        Name: "matchsvc_presence_online_total",
        Help: "Current number of online users (rough gauge)",
    })
)

func init() {
    prometheus.MustRegister(QueueDepth, MatchesFormedTotal, PresenceOnline)
}

func Register(mux *http.ServeMux) {
    mux.Handle("/metrics", promhttp.Handler())
}

