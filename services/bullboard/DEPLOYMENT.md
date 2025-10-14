# Railway Deployment Guide for Bull Board

## Complete Step-by-Step Instructions

### Prerequisites

- Railway account with your ConquestK project open
- Your main backend service already deployed
- Redis service already running in Railway

### Step 1: Create the Service

1. **Open your Railway project**
2. **Click the "+ New" button** in the top right
3. **Select "Empty Service"**
4. **Name it**: `bullboard` (or `queue-dashboard` - your choice)

### Step 2: Connect Source Code

1. **Click on the new `bullboard` service**
2. **Go to "Settings" tab**
3. **Under "Source"**, click **"Connect Repo"**
4. **Select your repository**: `conquestk/risk-game`
5. **Set Root Directory**: `services/bullboard`
   - ⚠️ **Important**: Railway needs to know where the service code lives!

### Step 3: Configure Build Settings

In Settings → Deploy:

| Setting | Value |
|---------|-------|
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Watch Paths** | `services/bullboard/**` (optional, for auto-deploys) |

### Step 4: Add Environment Variables

**Go to "Variables" tab** and add these:

#### Required Variables

**REDIS_URL** (Reference):
1. Click **"+ New Variable"**
2. Click **"Add Reference"** button
3. Select your **Redis service** from the dropdown
4. Select variable: **`REDIS_URL`**
5. Click **"Add"**

**BULL_PREFIX**:
- **Variable**: `BULL_PREFIX`
- **Value**: `bull` (must match your backend's BULL_PREFIX)
- ℹ️ Check your backend service's variables to confirm this value

**BB_USERNAME**:
- **Variable**: `BB_USERNAME`
- **Value**: `admin` (or your preferred username)

**BB_PASSWORD**:
- **Variable**: `BB_PASSWORD`
- **Value**: A strong password (generate one!)
- 🔐 **Use a real password** - this protects your queue dashboard

**COOKIE_SECRET**:
- **Variable**: `COOKIE_SECRET`
- **Value**: Random 32-character string
- 💡 Generate one: `openssl rand -base64 32` or use https://1password.com/password-generator/

#### Optional Variables

**LOG_LEVEL**:
- **Variable**: `LOG_LEVEL`
- **Value**: `info` (or `debug` for more logs)

**NODE_ENV**:
- **Variable**: `NODE_ENV`
- **Value**: `production`

### Step 5: Deploy

1. **Click "Deploy" button** (or just save - Railway auto-deploys)
2. **Watch the logs** in the "Deployments" tab
3. You should see:
   ```
   🚀 Bull Board starting...
   📋 Registered queue: game-actions
   📋 Registered queue: game-cleanup
   ✅ Connected to Redis
   ✅ Bull Board is running!
   ```

### Step 6: Get Your URL

1. **Go to "Settings" tab**
2. **Scroll to "Networking"**
3. **Click "Generate Domain"**
4. Railway will create a URL like: `https://bullboard-production-xxxx.up.railway.app`
5. **Copy this URL** - you'll use it to access Bull Board

### Step 7: Access Bull Board

1. **Open the Railway-provided URL** in your browser
2. You'll see a **login prompt** (HTTP Basic Auth)
3. **Enter**:
   - Username: Your `BB_USERNAME`
   - Password: Your `BB_PASSWORD`
4. **You should see the Bull Board dashboard** with all your queues!

## Verification Checklist

After deployment, verify:

- [ ] Service shows "Active" status in Railway
- [ ] Logs show "Connected to Redis" ✅
- [ ] Logs show all 5 queues registered
- [ ] Can access the URL without errors
- [ ] Login prompt appears
- [ ] Can log in with BB_USERNAME/BB_PASSWORD
- [ ] Dashboard shows all queues (even if empty)

## Troubleshooting

### "Application failed to respond"

**Problem**: Service deployed but URL returns 503

**Check**:
1. View deployment logs - look for errors
2. Is Redis connected? Look for "✅ Connected to Redis"
3. Is the port correct? Railway auto-provides `PORT` variable

**Fix**:
- Check logs for specific error
- Verify REDIS_URL is a **reference** to Redis service, not a hardcoded string

### "No queues showing up"

**Problem**: Dashboard is empty

**Possible causes**:
1. Wrong `BULL_PREFIX` - must match backend exactly
2. Redis URL pointing to wrong instance
3. No jobs have been created yet (this is OK!)

**Fix**:
```bash
# Compare these between backend and bullboard services:
Backend BULL_PREFIX: bull
BullBoard BULL_PREFIX: bull  ← Must match!

# Verify both use same Redis
Both should have REDIS_URL referencing the same Redis service
```

### "Invalid credentials" when logging in

**Problem**: Can't log in with password

**Check**:
1. Did you set `BB_USERNAME` and `BB_PASSWORD` in Railway variables?
2. Browser might have cached old credentials

**Fix**:
- Double-check Railway environment variables (Settings → Variables)
- Try incognito/private browsing mode
- Clear browser cache

### Redis connection errors

**Problem**: Logs show "Redis connection error"

**Check**:
1. Is Redis service running in Railway?
2. Is `REDIS_URL` a **reference** or hardcoded?

**Fix**:
1. Go to Variables tab
2. **Delete** `REDIS_URL` if it's a string value
3. Add new variable → **"Add Reference"** → Select Redis service
4. Redeploy

### Build fails

**Problem**: Deployment fails during build

**Check**:
1. Is "Root Directory" set to `services/bullboard`?
2. Are you on the correct branch?

**Fix**:
- Settings → Root Directory → `services/bullboard`
- Settings → Branch → `main` (or your deploy branch)
- Trigger redeploy

## Environment Variables Reference

| Variable | Type | Required | Example | Notes |
|----------|------|----------|---------|-------|
| `REDIS_URL` | Reference | ✅ Yes | `redis://...` | Must reference your Redis service |
| `BULL_PREFIX` | String | ✅ Yes | `bull` | Must match backend |
| `BB_USERNAME` | String | ✅ Yes | `admin` | Dashboard login username |
| `BB_PASSWORD` | String | ✅ Yes | `MyStr0ngP@ss!` | Dashboard login password |
| `COOKIE_SECRET` | String | ✅ Yes | `abc123...` | 32-char random string |
| `PORT` | Auto | No | `3000` | Railway provides automatically |
| `LOG_LEVEL` | String | No | `info` | `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | String | No | `production` | Railway sets automatically |

## Security Best Practices

1. **Use a strong password** for `BB_PASSWORD`
   - At least 16 characters
   - Mix of letters, numbers, symbols
   - Don't share it publicly

2. **Don't commit `.env` file**
   - It's already in `.gitignore`
   - Only use Railway environment variables

3. **Rotate credentials periodically**
   - Change `BB_PASSWORD` every few months
   - Update `COOKIE_SECRET` if compromised

4. **Limit access**
   - Only share the URL with team members who need queue access
   - Consider using Railway's private networking if available

## Updating the Service

### Adding/Removing Queues

If you add or remove queues in your backend:

1. **Edit** `services/bullboard/index.js`
2. **Update** the `QUEUE_NAMES` array:
   ```javascript
   const QUEUE_NAMES = [
     'game-actions',
     'game-cleanup',
     'analytics-events',
     'maintenance',
     'map-assets',
     'your-new-queue-name', // Add here
   ]
   ```
3. **Commit and push** to GitHub
4. Railway will **auto-deploy** the changes

### Updating Dependencies

```bash
cd services/bullboard
npm update
git commit -am "Update Bull Board dependencies"
git push
```

Railway will rebuild and redeploy automatically.

## Cost Optimization

Bull Board uses minimal resources:
- **No database** - only reads from Redis
- **Low memory** - ~50-100MB
- **Low CPU** - only active when you're viewing the dashboard

Railway charges by usage, so this service should cost very little (likely free tier).

## Next Steps

Once deployed:

1. **Bookmark the URL** for easy access
2. **Test it** by triggering some jobs in your app
3. **Monitor** failed jobs and fix issues
4. **Set up alerts** (optional) if you want notifications for failed jobs

---

Need help? Check the main [README.md](README.md) or review your backend's queue configuration in `backend/src/services/queueService.ts`.
