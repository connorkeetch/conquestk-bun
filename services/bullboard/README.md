# Bull Board - Queue Monitoring Dashboard

A standalone service for monitoring ConquestK's BullMQ background job queues.

## What It Does

This service provides a web dashboard showing:
- All background jobs (game actions, cleanup, analytics, maintenance, map assets)
- Job statuses (waiting, active, completed, failed, delayed)
- Failed job details and error messages
- Queue health and performance metrics
- **Retry buttons** for failed jobs directly in the UI
- **Pause/Resume controls** for each queue
- **Custom metrics endpoint** with aggregated statistics
- **Automatic cleanup** of old jobs (runs hourly)

**Live Dashboard**: https://bullboard-production-e18d.up.railway.app

## Architecture

This runs as a **separate Railway service** (not embedded in the backend) because:
- **Simpler**: No routing conflicts with Express
- **Isolated**: Can't crash the main backend
- **Independent**: Deploy and update separately
- **Secure**: Easy to password-protect

## Local Development

```bash
cd services/bullboard
npm install
cp .env.example .env
# Edit .env with your Redis connection
npm start
```

Visit `http://localhost:3000` and log in with your configured username/password.

### Environment Variables

```bash
REDIS_URL=redis://localhost:6379    # Must match backend's Redis
BULL_PREFIX=bull                    # Must match backend's BULL_PREFIX
BB_USERNAME=admin                   # Dashboard login username
BB_PASSWORD=strong-password         # Dashboard login password
COOKIE_SECRET=random-32-char-string # Generate with: openssl rand -base64 32
PORT=3000                           # Server port (Railway auto-provides)
```

## Railway Deployment

### Quick Setup

1. **Create Service**: Railway → "+ New" → "Empty Service" → name it `bullboard`
2. **Connect Repo**: Settings → Source → Root Directory: `services/bullboard`
3. **Set Variables** (in Variables tab):
   - `REDIS_URL`: **Reference** your Redis service (don't hardcode!)
   - `BULL_PREFIX`: `bull` (check backend to confirm)
   - `BB_USERNAME`: `admin`
   - `BB_PASSWORD`: Strong password
   - `COOKIE_SECRET`: `openssl rand -base64 32`
4. **Deploy**: Railway auto-deploys
5. **Generate Domain**: Settings → Networking → Generate Domain
6. **Access**: Visit URL, log in with BB_USERNAME/BB_PASSWORD

### Critical: Redis Connection

Both backend and Bull Board **must**:
- Connect to the **same Redis instance**
- Use the **same BULL_PREFIX** value

In Railway, use a **reference** to Redis (not a hardcoded URL):
```
REDIS_URL → Add Reference → Select Redis service → REDIS_URL
```

## Monitored Queues

Defined in `index.js` line 33:

- `game-actions` - Real-time game moves and AI turns
- `game-cleanup` - Cleanup after finished games
- `analytics-events` - Analytics tracking
- `maintenance` - Scheduled maintenance tasks
- `map-assets` - Map image processing

Must match `backend/src/services/queueService.ts` queue names.

## Troubleshooting

### No queues showing
- Verify `BULL_PREFIX` matches backend exactly
- Confirm `REDIS_URL` references correct Redis instance
- Check Redis is running

### Can't log in
- Verify `BB_USERNAME` and `BB_PASSWORD` in Railway variables
- Try incognito mode (browser may cache credentials)

### Redis connection error
- Ensure Redis service is running in Railway
- Use **reference** for `REDIS_URL`, not hardcoded string
- Check logs for connection details

### Health check
Visit `https://your-url.railway.app/health` (requires login):
```json
{
  "status": "healthy",
  "redis": "connected"
}
```

### Custom Metrics Endpoint
Visit `https://your-url.railway.app/metrics` (requires login) for aggregated queue statistics:
```json
{
  "timestamp": "2025-10-14T09:34:12.345Z",
  "queues": {
    "game-actions": {
      "waiting": 5,
      "active": 2,
      "completed": 1234,
      "failed": 3,
      "delayed": 0,
      "isPaused": false
    }
  },
  "totals": {
    "waiting": 15,
    "active": 4,
    "completed": 5678,
    "failed": 12,
    "delayed": 0
  }
}
```

## Features

### Automatic Job Cleanup

The service automatically cleans up old jobs to prevent database bloat:
- Runs every **1 hour** (starting 30 seconds after service startup)
- Removes jobs older than **7 days**
- Keeps the most recent **1000 completed** and **1000 failed** jobs per queue
- Logs cleanup results to help monitor performance

Check the Railway logs to see cleanup activity:
```
🧹 Running auto-cleanup of old jobs...
  ✅ game-actions: cleaned 245 old jobs (200 completed, 45 failed)
  ✅ analytics-events: cleaned 89 old jobs (89 completed, 0 failed)
✅ Auto-cleanup complete
```

### Queue Descriptions

Each queue has a helpful description shown in the UI:
- **game-actions**: Real-time game moves, attacks, fortifies, and AI turns
- **game-cleanup**: Cleanup tasks after games finish
- **analytics-events**: Analytics tracking and metrics
- **maintenance**: Scheduled maintenance and background tasks
- **map-assets**: Map image processing and optimization

### Enhanced UI Controls

The Bull Board UI includes:
- **Retry buttons** for failed jobs (enabled via `allowRetries: true`)
- **Pause/Resume** controls for each queue
- **Job name formatting** with queue prefix for clarity
- **Queue statistics** showing waiting, active, completed, failed, and delayed counts

## Updating Queues

To add/remove queues:

1. Edit `services/bullboard/index.js`
2. Update `QUEUE_NAMES` array (line 40)
3. Optionally add description to `QUEUE_DESCRIPTIONS` (line 48)
4. Commit and push
5. Railway auto-redeploys

## Technology Stack

- **Fastify 5** - Fast web framework
- **Bull Board 6** - Queue dashboard UI
- **BullMQ 5** - Queue client
- **ioredis** - Redis client
- **HTTP Basic Auth** - Simple password protection

## Security

- Never commit `.env` file (in `.gitignore`)
- Use strong passwords for production
- Only share URL with team members needing queue access
- Rotate `BB_PASSWORD` periodically

## Frontend Integration

The AdminQueues page in the frontend has a button that opens Bull Board in a new tab:

```typescript
// frontend/src/pages/AdminQueues.tsx
const bullBoardUrl = 'https://bullboard-production-e18d.up.railway.app/?status=active'
window.open(bullBoardUrl, '_blank', 'noopener,noreferrer')
```

Update this URL if you change the Railway domain.
