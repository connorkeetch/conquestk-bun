# Troubleshooting Guide

## 🔧 Common Issues & Fixes

### ❌ "Port already in use"
**Problem**: Backend port 5001 or frontend port 5173 is occupied
```bash
# Check what's using the port
netstat -ano | findstr :5001
netstat -ano | findstr :5173

# Kill the process (replace PID)
taskkill /PID <process-id> /F
```

### ❌ "Cannot connect to PostgreSQL"
**Problem**: Database connection issues
```bash
# Check DATABASE_URL in backend/.env
# Verify Railway database is running
# Contact admin for connection string if needed
```

**Sandbox note**: The OpenAI agent sandbox blocks outbound TCP ports above 443. Use the local
connection string from [docs/operations/openai-sandbox.md](openai-sandbox.md) instead of the shared
Railway URL to avoid `connect ENETUNREACH` errors.

### ❌ Frontend won't connect to backend
**Problem**: CORS or network issues
1. Check backend is running on port 5001
2. Verify `VITE_API_URL` in `frontend/.env`
3. Check browser console for CORS errors
4. **Note**: Frontend runs on port 5173 (Vite default)

### ❌ Database connection failed
**Problem**: PostgreSQL connection issues
```bash
# Check DATABASE_URL in backend/.env
# Development: Railway dev database
# Production: Railway production database
# Both URLs provided by Railway platform
```

**Sandbox note**: Swap the `DATABASE_URL` to the localhost value described in the sandbox deployment
guide; the hosted Railway port is unreachable from within the sandbox network.

### ❌ Admin Panel 500 Errors
**Problem**: Admin endpoints returning 500 errors
```bash
# Common causes:
1. Database migrations not run
2. Missing database columns/tables
3. Invalid JWT token cached in browser

# Fixes:
1. Clear browser cache/cookies for the site
2. Run migrations: cd backend && npm run migrate
3. Check production database directly:
   cd backend && npm run check:schema
```

### ❌ "column 'theme' does not exist"
**Problem**: Missing database columns after deployment
```bash
# This means migrations haven't run on production
# As of January 2025, migrations auto-run on deployment via:
# backend/package.json start script

# Manual fix if needed:
cd backend && npm run migrate

# Or connect to production DB and run:
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'default'
```

### ❌ "Unexpected token '*'" JWT Error
**Problem**: Invalid JWT token being sent as "*"
```bash
# Browser is caching a null token as string "*"
# Fix:
1. Clear browser localStorage
2. Clear cookies for the site
3. Log out and log back in
```

### ❌ Map Editor Canvas Issues
**Problem**: Canvas not drawing or territories not saving
1. Check browser console for JavaScript errors
2. Ensure backend is running and database migration applied
3. Verify file upload permissions for map images

### ❌ "PowerShell execution policy"
**Problem**: Cannot run PowerShell scripts
```powershell
# Run as administrator:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or use the bypass flag (already included in npm scripts)
powershell -ExecutionPolicy Bypass -File ./start-dev.ps1
```

### ❌ Node.js/npm not found
**Problem**: Node.js not installed or not in PATH
1. Download and install Node.js from [nodejs.org](https://nodejs.org/)
2. Restart your terminal
3. Verify: `node --version` and `npm --version`

### ❌ Production Build Errors
**Problem**: Missing VAPID keys causing crash
**Solution**: Fixed in latest version - app now runs without notification keys

### ❌ High database connection usage
**Problem**: Connection pool nearing max utilization
1. Call `getPoolMetrics()` to inspect `totalCount`, `idleCount`, and `waitingCount`.
2. Look for long-running transactions or un-awaited queries that may hold connections open.
3. Confirm new code paths release pooled clients inside `try/catch/finally` blocks.
4. In staging/production, verify pool limits remain within the recommended 5-25 (prod) or 2-15 (dev) range.

### ❌ Redis cache misses
**Problem**: Cache hit rate drops below expectations
1. Verify TTLs align with workload (1 hour active games, 24 hours inactive, 30 minutes templates, 2 hours map modifiers).
2. Double-check cache keys match the `CacheService` prefix patterns and avoid typos.
3. Inspect Redis memory usage/evictions to ensure the dataset fits within provisioned limits.
4. Warm caches proactively if major deployments flush existing entries.

### ❌ Socket.io performance degradation
**Problem**: Clients receive large payloads or lag in real-time updates
1. Confirm emitters are using `DeltaBuilder` helpers instead of full state broadcasts.
2. Check browser dev tools to ensure the frontend still applies `applyDelta` reducers without warnings.
3. Audit listeners for accidental legacy event usage and remove any redundant full-state fallbacks.
4. Monitor network panel bandwidth per connection; expect ~60% lower usage versus the original full payload stream.

## 🆘 Getting Help

1. **Run setup check**: `npm run setup`
2. **Check browser console** for JavaScript errors
3. **Check backend logs** in terminal for API errors
4. **Verify ports**: Backend (5001) and Frontend (5173) available
5. **Test basic functionality**: Can you register/login and view games?
6. **Memory search**: Use memory integration for troubleshooting context

## 🎉 Success Indicators

✅ Setup check passes without errors  
✅ Backend starts on http://localhost:5001  
✅ Frontend starts on http://localhost:5173  
✅ Browser shows Risk game interface  
✅ No console errors in browser developer tools  
✅ Can register/login successfully  
✅ Map editor loads at `/map-editor`  
✅ Backend responds to `/api/maps` endpoints
**Post-September 2025: Sector migration related**
```bash
# Errors mentioning map_continents/continent columns
# indicate the continents→sectors migration wasn't applied.
cd backend && npm run migrate

# Verify tables/columns exist
\d+ map_sectors
\d+ map_territories  -- expect a 'sector' column
```
### ⏱️ Turn timer hits 0 but nothing happens
**Problem**: AFK/timeout skip does not trigger
1. Verify Redis is running locally on `localhost:6379`. The turn timeout job uses BullMQ + Redis.
2. Check backend logs for `QueueService not available` warnings.
3. Confirm WorkerManager is initialized: `GET /api/queue/health` (should return `healthy`).
4. Development fallback: without Redis, the server uses a local in‑process timer to trigger timeouts. Ensure the backend process stayed alive past the expiry window.
5. If you changed `turn_timer` mid-game, rescheduling happens on the next phase/turn transition.

What happens on expiry:
- If the player has a time bank, the turn consumes it and reschedules.
- Otherwise the player’s `missed_turns` increments and `last_missed_turn_at` is set.
- The rest of the turn is skipped immediately; on the 3rd miss, the player is kicked and neutralized.
