# 🚀 Deployment Guide for ConquestK.com

## Railway Deployment Setup

### 1. Pre-deployment Checklist
- [x] Domain purchased: conquestk.com
- [x] Frontend configured for production
- [x] Backend CORS updated for production domain
- [x] Railway configuration files created
- [x] Production environment variables prepared

### 2. Railway Project Setup

1. **Connect GitHub Repository**
   - Login to [Railway](https://railway.app)
   - Create new project from GitHub
   - Connect your risk-game repository

2. **Environment Variables**
   Set the following in Railway dashboard:

   ```bash
   NODE_ENV=production
   PORT=5001
   FRONTEND_URL=https://conquestk.com
   JWT_SECRET=your-super-secure-jwt-secret-here
   LOG_LEVEL=info
   DB_TYPE=postgresql
   ```

3. **Database Setup**
   - Add PostgreSQL plugin to your Railway project
   - Railway will automatically provide `DATABASE_URL`
   - The app will auto-migrate on first startup

4. **Custom Domain**
   - In Railway dashboard, go to Settings > Domains
   - Add custom domain: `conquestk.com`
   - Follow Railway's instructions to update DNS records

### 3. DNS Configuration
Point your domain to Railway:
```
A record: @ → [Railway IP from dashboard]
CNAME record: www → [Railway domain]
```

### 4. Build Process
Railway will automatically:
1. Install all dependencies (`npm ci`)
2. Build frontend (`npm run build:frontend`)
3. Build backend (`npm run build:backend`) 
4. Start the server (`npm start`)

### 5. Environment-Specific URLs

**Development:**
- Frontend: http://localhost:5173
- Backend: http://localhost:5001

**Production:**
- Both: https://conquestk.com (single-server deployment)

### 6. Database Migration
The app automatically handles database setup:
- SQLite for development
- PostgreSQL for production (Railway-provided)
- Migrations run on server startup

### 7. File Uploads
- Images stored in `/uploads` directory
- Persistent storage configured through Railway volumes

### 8. Monitoring
- Health check endpoint: `GET /health`
- Railway provides built-in monitoring
- Winston logging configured for production

### 9. Security Features
- Helmet.js for security headers
- CORS properly configured for production
- JWT authentication
- Environment variable protection

## Manual Deployment Commands

If you need to deploy manually:

```bash
# Build everything
npm run build

# Start in production mode
NODE_ENV=production npm start
```

## Troubleshooting

**Common Issues:**
1. **CORS errors** - Check FRONTEND_URL matches your domain
2. **Database connection** - Ensure DATABASE_URL is set by Railway
3. **Build failures** - Check all dependencies are in package.json
4. **Socket.io connection** - Verify both HTTP and WebSocket ports are open

**Debug Commands:**
```bash
# Check environment variables
echo $NODE_ENV
echo $DATABASE_URL

# Verify build output
ls -la backend/dist/
ls -la backend/public/

# Test health endpoint
curl https://conquestk.com/health
```

## Success Indicators

✅ Build completes without errors
✅ Health endpoint returns 200
✅ Frontend loads at https://conquestk.com
✅ WebSocket connections work
✅ Database queries succeed
✅ File uploads work
✅ Authentication flows work

## Next Steps After Deployment

1. Test all game functionality
2. Set up monitoring/alerts
3. Configure backup strategy
4. Set up CI/CD pipeline for updates
5. Add SSL certificate (Railway handles this automatically)
6. Test mobile responsiveness
7. Performance optimization