# syntax=docker/dockerfile:1

FROM golang:1.22-alpine AS build
WORKDIR /src
RUN apk add --no-cache git
COPY . ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -extldflags -static" -o /out/matchsvc ./cmd/matchsvc

FROM gcr.io/distroless/static:nonroot
COPY --from=build /out/matchsvc /matchsvc
USER nonroot:nonroot
EXPOSE 8085
ENTRYPOINT ["/matchsvc"]

