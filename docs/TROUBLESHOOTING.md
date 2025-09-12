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
   npx ts-node src/scripts/checkProductionDb.ts
```

### ❌ "column 'theme' does not exist"
**Problem**: Missing database columns after deployment
```bash
# This means migrations haven't run on production
# As of Sept 2025, migrations auto-run on deployment via:
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