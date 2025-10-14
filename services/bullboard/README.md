# ConquestK Bull Board Service

A standalone dashboard for monitoring BullMQ queues used by ConquestK.

## What This Does

This is a **separate web service** that connects to your Redis database and shows you:
- All your background jobs (game actions, cleanup, analytics, etc.)
- Job statuses (waiting, active, completed, failed)
- Failed job details and errors
- Queue health and performance

Think of it as a "task manager" for your background jobs.

## Why It's Separate

After multiple attempts to integrate Bull Board into the main backend, we decided to run it as its own service because:
1. **Simpler** - No complex routing conflicts with the main app
2. **Isolated** - If it breaks, your game still works
3. **Easier to deploy** - Just point it at Redis and go
4. **Better security** - Easy to password-protect the whole thing

## Local Development

### 1. Install Dependencies

```bash
cd services/bullboard
npm install
```

### 2. Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and set:
- `REDIS_URL` - Your Redis connection (same as backend uses)
- `BULL_PREFIX` - Should match your backend's `BULL_PREFIX` (default: `bull`)
- `BB_USERNAME` - Admin username
- `BB_PASSWORD` - Strong password

### 3. Run It

```bash
npm start
```

Visit `http://localhost:3000` and log in with your username/password.

## Railway Deployment

### Step 1: Create New Service in Railway

1. Go to your Railway project
2. Click **"+ New"** → **"Empty Service"**
3. Name it `bullboard` or `queue-dashboard`

### Step 2: Connect to Your Repository

1. In the new service, click **"Settings"**
2. Under **"Service"** → **"Source"**, connect to your GitHub repo
3. Set **Root Directory** to: `services/bullboard`
4. Set **Build Command** to: `npm install`
5. Set **Start Command** to: `npm start`

### Step 3: Set Environment Variables

In the service's **"Variables"** tab, add:

| Variable | Value | Notes |
|----------|-------|-------|
| `REDIS_URL` | Reference your Redis service | Click "+ New Variable" → "Add Reference" → Select your Redis service → `REDIS_URL` |
| `BULL_PREFIX` | `bull` | Must match backend (check your backend's env vars) |
| `BB_USERNAME` | `admin` | Choose your own username |
| `BB_PASSWORD` | `strong-password-here` | **Use a real password!** |
| `COOKIE_SECRET` | Generate a random 32-char string | Use: `openssl rand -base64 32` |
| `PORT` | Railway auto-provides this | Leave it as Railway's default |

### Step 4: Deploy

1. Click **"Deploy"** or push to your repo
2. Wait for build to complete
3. Railway will give you a public URL like `https://bullboard-production-xxxx.up.railway.app`

### Step 5: Access Your Dashboard

1. Open the Railway-provided URL
2. You'll see a login prompt (browser's basic auth)
3. Enter your `BB_USERNAME` and `BB_PASSWORD`
4. You should see all your queues!

## Important: Redis Connection

Both services (your main backend and this Bull Board) must use the **same Redis instance** and the **same `BULL_PREFIX`**.

In Railway:
- Your backend service has `REDIS_URL` pointing to your Redis service
- This Bull Board service needs the **exact same** `REDIS_URL` reference
- Both should have the same `BULL_PREFIX` value (default is `bull`)

## Troubleshooting

### "No queues showing"

**Check:**
1. Is `REDIS_URL` correct?
2. Does `BULL_PREFIX` match your backend? (Check backend's env vars)
3. Is Redis running?
4. Are there actually jobs in the queues?

**Fix:**
```bash
# In Railway, check your backend's BULL_PREFIX variable
# Make sure Bull Board has the EXACT SAME value
```

### "Can't connect to Redis"

**Check:**
1. Is Redis service running in Railway?
2. Did you use a **reference** to the Redis service (not a manual URL)?

**Fix:**
In Railway Bull Board variables:
- Delete `REDIS_URL` if you typed it manually
- Add new variable → "Add Reference" → Select Redis service → Choose `REDIS_URL`

### "Wrong password" when logging in

**Check:**
1. Did you set `BB_USERNAME` and `BB_PASSWORD` in Railway variables?
2. Browser might have cached old credentials

**Fix:**
- Clear browser cache or use incognito mode
- Double-check the Railway environment variables

### Health check failing

Visit `https://your-bullboard-url.railway.app/health` (you'll need to log in first).

Should return:
```json
{
  "status": "healthy",
  "redis": "connected"
}
```

If it says `"unhealthy"`, Redis connection is broken.

## Security Notes

- **Never** commit `.env` file (it's in `.gitignore`)
- Use a **strong password** for `BB_PASSWORD` in production
- This service is password-protected with HTTP Basic Auth
- Only share the URL with people who need queue access

## Queue Names

This service monitors these queues (defined in [index.js:33](index.js#L33)):

- `game-actions` - Real-time game moves
- `game-cleanup` - Cleaning up finished games
- `analytics-events` - Analytics tracking
- `maintenance` - Maintenance tasks
- `map-assets` - Map image processing

These must match your backend's queue names in `backend/src/services/queueService.ts`.

## Updating

If you add/remove queues in your backend:

1. Edit `services/bullboard/index.js`
2. Update the `QUEUE_NAMES` array (line 33)
3. Commit and push
4. Railway will auto-redeploy

## Technology

- **Fastify 5** - Fast web framework
- **Bull Board 6** - Queue dashboard UI
- **BullMQ 5** - Queue client
- **Basic Auth** - Simple password protection
