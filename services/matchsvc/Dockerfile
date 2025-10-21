# syntax=docker/dockerfile:1
# Go 1.25.3 brings:
# - Container-aware GOMAXPROCS for better CPU limit handling
# - DWARF 5 debug info (smaller binaries, faster linking)
# - Fused multiply-add instructions (GOAMD64=v3+)
# - Concurrent cleanup functions
# - New testing/synctest for concurrent code testing

FROM golang:1.25.3-alpine AS build
WORKDIR /src
RUN apk add --no-cache git
COPY . ./
# Ensure go.sum is generated for all packages
RUN go mod tidy
# Build static binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w -extldflags -static" -o /out/matchsvc ./cmd/matchsvc

FROM gcr.io/distroless/static:nonroot
COPY --from=build /out/matchsvc /matchsvc
USER nonroot:nonroot
EXPOSE 8085
ENTRYPOINT ["/matchsvc"]
