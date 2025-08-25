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

### ❌ "Cannot find module 'sqlite3'"
**Problem**: SQLite dependency missing
```bash
cd backend
npm install sqlite3
```

### ❌ Frontend won't connect to backend
**Problem**: CORS or network issues
1. Check backend is running on port 5001
2. Verify `VITE_API_URL` in `frontend/.env`
3. Check browser console for CORS errors
4. **Note**: Frontend runs on port 5173 (Vite default)

### ❌ Database connection failed
**Problem**: PostgreSQL not available (switches to SQLite automatically)
```bash
# Option 1: Use SQLite (default)
# Nothing to do - already configured

# Option 2: Setup PostgreSQL
# Install PostgreSQL, then:
createdb risk_game
# Set DB_TYPE=postgresql in backend/.env
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