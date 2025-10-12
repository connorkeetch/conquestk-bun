package presence

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/conquestk/matchsvc/pkg/metrics"
    "github.com/redis/go-redis/v9"
    "github.com/rs/zerolog/log"
)

type OnlineRequest struct {
    UserID       string  `json:"user_id"`
    ConnectionID string  `json:"connection_id"`
    RoomID       *string `json:"room_id,omitempty"`
}

type OfflineRequest struct {
    UserID       string `json:"user_id"`
    ConnectionID string `json:"connection_id"`
}

type MoveRequest struct {
    UserID    string  `json:"user_id"`
    FromRoom  *string `json:"from_room_id,omitempty"`
    ToRoom    *string `json:"to_room_id,omitempty"`
}

type UserOnlineResponse struct {
    Status string `json:"status"`
}

type UserOfflineResponse struct {
    Status string `json:"status"`
}

type UserMoveResponse struct {
    Status string `json:"status"`
}

type GetPresenceResponse struct {
    Status      string   `json:"status"`
    RoomID      *string  `json:"room_id,omitempty"`
    Connections []string `json:"connections"`
}

type GetRoomRosterResponse struct {
    Members []string `json:"members"`
}

type Service struct {
    rdb *redis.Client
}

func NewService(rdb *redis.Client) *Service {
    return &Service{rdb: rdb}
}

const (
    presenceKeyFmt = "presence:%s"
    roomMembersFmt = "room:%s:members"
    eventsChannel  = "matchsvc:events"
)

type presenceDoc struct {
    Status       string   `json:"status"`
    LastSeen     int64    `json:"lastSeen"`
    ConnectionIDs []string `json:"connectionIds"`
    RoomID       *string  `json:"roomId,omitempty"`
}

func (s *Service) SetOnline(ctx context.Context, req OnlineRequest) (any, int, error) {
    if req.UserID == "" || req.ConnectionID == "" {
        return nil, 400, fmt.Errorf("user_id and connection_id required")
    }
    key := fmt.Sprintf(presenceKeyFmt, req.UserID)
    // Use a small Lua script for atomic upsert
    script := redis.NewScript(`
    local key = KEYS[1]
    local conn = ARGV[1]
    local now = ARGV[2]
    local room = ARGV[3]
    local data = redis.call('GET', key)
    local doc
    if data then
      doc = cjson.decode(data)
    else
      doc = { status = 'online', lastSeen = tonumber(now), connectionIds = {} }
    end
    -- ensure conn id present
    local exists = false
    for i,v in ipairs(doc.connectionIds) do if v == conn then exists = true break end end
    if not exists then table.insert(doc.connectionIds, conn) end
    doc.status = 'online'
    doc.lastSeen = tonumber(now)
    if room ~= '' then doc.roomId = room else doc.roomId = doc.roomId end
    redis.call('SET', key, cjson.encode(doc))
    return cjson.encode(doc)
  `)
    var roomArg string
    if req.RoomID != nil {
        roomArg = *req.RoomID
    }
    res, err := script.Run(ctx, s.rdb, []string{key}, req.ConnectionID, time.Now().Unix(), roomArg).Result()
    if err != nil {
        return nil, 500, err
    }
    var doc presenceDoc
    _ = json.Unmarshal([]byte(res.(string)), &doc)
    metrics.PresenceOnline.Inc()
    // room membership
    if req.RoomID != nil && *req.RoomID != "" {
        _ = s.rdb.SAdd(ctx, fmt.Sprintf(roomMembersFmt, *req.RoomID), req.UserID).Err()
        s.publish(ctx, map[string]any{
            "type":    "room.roster.updated",
            "roomId":  *req.RoomID,
            "members": s.getMembers(ctx, *req.RoomID),
        })
    }
    s.publish(ctx, map[string]any{
        "type":   "presence.changed",
        "userId": req.UserID,
        "status": "online",
        "roomId": req.RoomID,
    })
    return UserOnlineResponse{Status: "ok"}, 200, nil
}

func (s *Service) SetOffline(ctx context.Context, req OfflineRequest) (any, int, error) {
    if req.UserID == "" || req.ConnectionID == "" {
        return nil, 400, fmt.Errorf("user_id and connection_id required")
    }
    key := fmt.Sprintf(presenceKeyFmt, req.UserID)
    script := redis.NewScript(`
    local key = KEYS[1]
    local conn = ARGV[1]
    local now = ARGV[2]
    local data = redis.call('GET', key)
    if not data then return nil end
    local doc = cjson.decode(data)
    local idx = -1
    for i,v in ipairs(doc.connectionIds) do if v == conn then idx = i break end end
    if idx > 0 then table.remove(doc.connectionIds, idx) end
    if #doc.connectionIds == 0 then doc.status = 'offline' end
    doc.lastSeen = tonumber(now)
    redis.call('SET', key, cjson.encode(doc))
    return cjson.encode(doc)
  `)
    res, err := script.Run(ctx, s.rdb, []string{key}, req.ConnectionID, time.Now().Unix()).Result()
    if err != nil && err != redis.Nil {
        return nil, 500, err
    }
    if res == nil {
        return UserOfflineResponse{Status: "ok"}, 200, nil
    }
    var doc presenceDoc
    _ = json.Unmarshal([]byte(res.(string)), &doc)
    if doc.Status == "offline" {
        metrics.PresenceOnline.Dec()
        s.publish(ctx, map[string]any{
            "type":   "presence.changed",
            "userId": req.UserID,
            "status": "offline",
            "roomId": doc.RoomID,
        })
    }
    return UserOfflineResponse{Status: "ok"}, 200, nil
}

func (s *Service) MoveUser(ctx context.Context, req MoveRequest) (any, int, error) {
    key := fmt.Sprintf(presenceKeyFmt, req.UserID)
    // Update presence roomId and move membership sets
    if req.FromRoom != nil && *req.FromRoom != "" {
        _ = s.rdb.SRem(ctx, fmt.Sprintf(roomMembersFmt, *req.FromRoom), req.UserID).Err()
        s.publish(ctx, map[string]any{
            "type":    "room.roster.updated",
            "roomId":  *req.FromRoom,
            "members": s.getMembers(ctx, *req.FromRoom),
        })
    }
    if req.ToRoom != nil && *req.ToRoom != "" {
        _ = s.rdb.SAdd(ctx, fmt.Sprintf(roomMembersFmt, *req.ToRoom), req.UserID).Err()
        s.publish(ctx, map[string]any{
            "type":    "room.roster.updated",
            "roomId":  *req.ToRoom,
            "members": s.getMembers(ctx, *req.ToRoom),
        })
    }
    // Update presence doc
    doc := presenceDoc{Status: "online", LastSeen: time.Now().Unix()}
    if req.ToRoom != nil {
        doc.RoomID = req.ToRoom
    }
    b, _ := json.Marshal(doc)
    if err := s.rdb.Set(ctx, key, b, 0).Err(); err != nil {
        return nil, 500, err
    }
    s.publish(ctx, map[string]any{
        "type":   "presence.changed",
        "userId": req.UserID,
        "status": "online",
        "roomId": doc.RoomID,
    })
    return UserMoveResponse{Status: "ok"}, 200, nil
}

func (s *Service) GetRoomRoster(ctx context.Context, roomID string) (any, int, error) {
    members := s.getMembers(ctx, roomID)
    return GetRoomRosterResponse{Members: members}, 200, nil
}

func (s *Service) getMembers(ctx context.Context, roomID string) []string {
    vals, err := s.rdb.SMembers(ctx, fmt.Sprintf(roomMembersFmt, roomID)).Result()
    if err != nil {
        log.Error().Err(err).Str("room", roomID).Msg("failed to get room members")
        return []string{}
    }
    return vals
}

func (s *Service) GetPresence(ctx context.Context, userID string) (any, int, error) {
    key := fmt.Sprintf(presenceKeyFmt, userID)
    val, err := s.rdb.Get(ctx, key).Result()
    if err == redis.Nil {
        return GetPresenceResponse{Status: "offline", Connections: []string{}}, 200, nil
    }
    if err != nil {
        return nil, 500, err
    }
    var doc presenceDoc
    if err := json.Unmarshal([]byte(val), &doc); err != nil {
        return nil, 500, err
    }
    return GetPresenceResponse{Status: doc.Status, RoomID: doc.RoomID, Connections: doc.ConnectionIDs}, 200, nil
}

func (s *Service) publish(ctx context.Context, payload map[string]any) {
    b, _ := json.Marshal(payload)
    _ = s.rdb.Publish(ctx, eventsChannel, b).Err()
}
