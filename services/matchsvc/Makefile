BIN=matchsvc
PKG=github.com/conquestk/matchsvc/cmd/matchsvc

.PHONY: build run test tidy

build:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w -extldflags -static" -o bin/$(BIN) $(PKG)

run:
	go run ./cmd/matchsvc

test:
	go test ./...

tidy:
	go mod tidy

