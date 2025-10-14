# Bull Board - Quick Start for Connor

## What You Have Now

I've created a **standalone Bull Board service** that you can deploy separately on Railway. It's completely independent from your main backend, which solves all the routing/auth issues you were hitting.

## What It Does (In Plain English)

This is a web dashboard that shows you:
- All your background jobs (game actions, cleanups, etc.)
- Which ones are waiting, running, done, or failed
- Error messages when things go wrong
- Performance stats

Think of it like "Task Manager" for your game's background work.

## Files Created

```
services/bullboard/
├── index.js              # Main server code (75 lines, super simple)
├── package.json          # Dependencies (latest versions)
├── .env.example          # Example configuration
├── .env                  # Your local config (already set up)
├── .gitignore            # Don't commit node_modules or .env
├── README.md             # Detailed docs with troubleshooting
├── DEPLOYMENT.md         # Step-by-step Railway deployment
└── QUICK_START.md        # This file!
```

## Local Testing (Already Works!)

I tested it locally and it connects successfully:

```bash
cd services/bullboard
npm start
```

Then visit `http://localhost:3100` and log in with:
- **Username**: `admin`
- **Password**: `admin`

You should see all 5 queues listed (even if they're empty).

## Deploy to Railway

**Read [DEPLOYMENT.md](DEPLOYMENT.md)** for step-by-step instructions.

### Super Quick Version:

1. **Create new service** in Railway → "Empty Service" → name it `bullboard`
2. **Connect repo** → Root Directory: `services/bullboard`
3. **Set variables**:
   - `REDIS_URL`: Reference your existing Redis service
   - `BULL_PREFIX`: `bull` (must match backend)
   - `BB_USERNAME`: `admin`
   - `BB_PASSWORD`: (use a real password!)
   - `COOKIE_SECRET`: (generate random 32-char string)
4. **Deploy** and Railway gives you a URL
5. **Visit URL**, log in, see your queues!

## Key Points to Remember

### 1. **Redis Connection**

Bull Board must connect to the **same Redis** as your backend:
- In Railway, use a **reference** to your Redis service (not a hardcoded URL)
- Both backend and bullboard should point to the same Redis instance

### 2. **BULL_PREFIX Must Match**

Check your backend's `BULL_PREFIX` environment variable:
```bash
# In Railway backend variables:
BULL_PREFIX=bull

# Bull Board MUST have the same:
BULL_PREFIX=bull
```

If these don't match, you won't see any queues!

### 3. **It's Completely Separate**

- Bull Board is its own service with its own URL
- It doesn't affect your main backend at all
- If it breaks, your game keeps working
- You can deploy/update them independently

## Redis Question: Should You Keep It?

**YES**, absolutely keep Redis! Here's why:

### What Redis Does for You:

1. **Bull Queues** (background jobs)
   - Game actions processing
   - Cleanup tasks
   - Analytics events
   - AI turns

2. **Socket.io Adapter** (multi-server support)
   - Allows multiple backend instances to share socket connections
   - Critical when you scale beyond 1 server

3. **Session Storage** (if configured)
   - Stores user sessions across server restarts
   - Better than memory (doesn't lose sessions on deploy)

### Railway Redis vs Bitnami Redis

Both are **the same Redis software**, just different templates:

| Feature | Railway Redis | Bitnami Redis |
|---------|--------------|---------------|
| **Software** | Redis 7.x | Redis 7.x (same) |
| **Managed By** | Railway | Bitnami packaging |
| **Best For** | Simple setup | Enterprise features |
| **Your Needs** | ✅ Perfect | Overkill |

**Recommendation**: Stick with **Railway Redis** (your current one). It's simpler and does everything you need.

## What About Your Current Backend Bull Board Code?

You can **remove** or **disable** the Bull Board code from your backend now:

### Option 1: Disable It (Safer)

In your backend, set an environment variable:
```bash
BULL_BOARD_ENABLED=false
```

This keeps the code but turns it off.

### Option 2: Remove It (Cleaner)

After you verify the standalone service works, you can delete:
- `backend/src/routes/bullBoard.ts`
- Any Bull Board dependencies in backend's `package.json`
- Bull Board imports from `backend/src/index.ts`

I recommend **Option 1** first - test the standalone service for a few days, then clean up the old code.

## Troubleshooting

### "Can't see any queues"

- Check `BULL_PREFIX` matches backend exactly
- Verify `REDIS_URL` is connected to the right Redis

### "Can't log in"

- Check `BB_USERNAME` and `BB_PASSWORD` in Railway variables
- Try incognito mode (browser might cache old password)

### "Redis connection error"

- Verify Redis service is running in Railway
- Make sure `REDIS_URL` is a **reference**, not a hardcoded string

Full troubleshooting guide is in [DEPLOYMENT.md](DEPLOYMENT.md).

## Next Steps

1. **Deploy to Railway** using [DEPLOYMENT.md](DEPLOYMENT.md)
2. **Test it** by visiting the Railway URL and logging in
3. **Trigger some jobs** in your app and watch them appear
4. **Bookmark the URL** for easy access
5. **Disable/remove old backend Bull Board** code (optional)

## Questions?

- **How do I add/remove queues?**
  Edit `QUEUE_NAMES` array in `index.js`, commit, push → Railway auto-deploys

- **How much will this cost?**
  Almost nothing - it only uses resources when you're viewing the dashboard. Likely stays in Railway's free tier.

- **Is it secure?**
  Yes - password protected with HTTP Basic Auth. Only people with the URL and password can access it.

- **Can I access it from my phone?**
  Yes! The Railway URL works from anywhere. Just remember your username/password.

---

**You're all set!** The service is ready to deploy. Follow [DEPLOYMENT.md](DEPLOYMENT.md) step-by-step and you'll have a working queue dashboard in about 10 minutes.
