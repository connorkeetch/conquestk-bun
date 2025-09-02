# Railway Environment Variables Setup Guide

## 🔐 Critical Security Note
**NEVER** commit real credentials to Git. All sensitive values must be configured directly in Railway's dashboard.

## 📋 Required Environment Variables

### Production Service (conquestk.com)

```bash
# Core Configuration
NODE_ENV=production
PORT=${{PORT}}  # Railway provides this automatically

# Database (Railway PostgreSQL - auto-provided)
DATABASE_URL=${{DATABASE_URL}}  # Railway provides this from linked database

# Security Secrets (MUST be unique for production)
JWT_SECRET=                     # Generate with: openssl rand -base64 32
SESSION_SECRET=                 # Generate with: openssl rand -base64 32

# CORS & URLs
CORS_ORIGIN=https://conquestk.com
FRONTEND_URL=https://conquestk.com

# Redis (if using Railway Redis)
REDIS_URL=${{REDIS_URL}}       # Railway provides this from linked Redis

# Email Service (Resend)
RESEND_API_KEY=                # From Resend dashboard
EMAIL_FROM=noreply@conquestk.com
EMAIL_FROM_NAME=ConquestK
REQUIRE_EMAIL_VERIFICATION=true
EMAIL_VERIFICATION_EXPIRE_HOURS=24

# Monitoring
SENTRY_DSN=                     # From Sentry project settings
HEALTH_CHECK_TOKEN=             # Generate random token
LOG_LEVEL=info
ENABLE_DEBUG_LOGS=false

# Feature Flags
ENABLE_NEW_FEATURES=false
ENABLE_TOURNAMENTS=false
ENABLE_AI_PLAYERS=false

# Database Pool (Railway optimized)
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000
DB_STATEMENT_TIMEOUT=30000     # Maximum time for a single query
DB_QUERY_TIMEOUT=30000          # Overall query timeout
```

### Staging Service (risk-game-production-9935.up.railway.app)

```bash
# Core Configuration
NODE_ENV=staging
PORT=${{PORT}}

# Database (separate staging database)
DATABASE_URL=${{DATABASE_URL}}  # Railway staging database

# Security Secrets (different from production!)
JWT_SECRET=                     # Different from production
SESSION_SECRET=                 # Different from production

# CORS & URLs
CORS_ORIGIN=https://risk-game-production-9935.up.railway.app
FRONTEND_URL=https://risk-game-production-9935.up.railway.app

# Redis (optional for staging)
REDIS_URL=${{REDIS_URL}}

# Email Service (use test/sandbox)
RESEND_API_KEY=                # Use Resend test API key
EMAIL_FROM=staging@conquestk.com
REQUIRE_EMAIL_VERIFICATION=false  # Disabled for staging
EMAIL_ENABLED=false

# Monitoring
SENTRY_DSN=                     # Same as production or separate project
LOG_LEVEL=debug
ENABLE_DEBUG_LOGS=true

# Feature Flags (testing new features)
ENABLE_NEW_FEATURES=true
ENABLE_TOURNAMENTS=true
ENABLE_AI_PLAYERS=true

# Staging Protection
STAGING_AUTH_USER=admin
STAGING_AUTH_PASSWORD=          # Password for staging access
```

## 🔧 How to Set in Railway

### Step 1: Access Railway Dashboard
1. Go to https://railway.app/dashboard
2. Select your project
3. Click on the service (backend)

### Step 2: Navigate to Variables
1. Click "Variables" tab
2. You'll see "Shared Variables" and "Service Variables"

### Step 3: Add Variables
1. Click "New Variable"
2. Enter the key (e.g., `JWT_SECRET`)
3. Enter the value
4. Railway auto-saves

### Step 4: Use Railway's Features
- **Shared Variables**: Use for values shared between services
- **Reference Variables**: Use `${{VARIABLE_NAME}}` syntax
- **Service Variables**: Override shared variables per service

## 🔑 Generating Secure Secrets

### Generate JWT Secret
```bash
# Option 1: OpenSSL (recommended)
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 3: PowerShell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

### Generate Session Secret
```bash
# Same methods as JWT secret, but use a different value!
openssl rand -base64 32
```

### Generate Health Check Token
```bash
# Simpler token for internal use
openssl rand -hex 16
```

## 🔗 Railway Variable References

Railway provides these automatically when you link services:

```bash
# From PostgreSQL Plugin
DATABASE_URL=${{Postgres.DATABASE_URL}}
PGDATABASE=${{Postgres.PGDATABASE}}
PGHOST=${{Postgres.PGHOST}}
PGPASSWORD=${{Postgres.PGPASSWORD}}
PGPORT=${{Postgres.PGPORT}}
PGUSER=${{Postgres.PGUSER}}

# From Redis Plugin
REDIS_URL=${{Redis.REDIS_URL}}
REDISHOST=${{Redis.REDISHOST}}
REDISPASSWORD=${{Redis.REDISPASSWORD}}
REDISPORT=${{Redis.REDISPORT}}
REDISUSER=${{Redis.REDISUSER}}

# Railway System Variables
PORT=${{PORT}}
RAILWAY_ENVIRONMENT=${{RAILWAY_ENVIRONMENT}}
RAILWAY_PROJECT_ID=${{RAILWAY_PROJECT_ID}}
RAILWAY_SERVICE_ID=${{RAILWAY_SERVICE_ID}}
```

## 🚀 Setting Up GitHub Secrets

For the CI/CD pipeline to work, add these to GitHub:

1. Go to GitHub repo → Settings → Secrets → Actions
2. Add these secrets:

```yaml
RAILWAY_STAGING_WEBHOOK: <from Railway staging service>
RAILWAY_PRODUCTION_WEBHOOK: <from Railway production service>
```

### Getting Railway Webhooks
1. In Railway service settings
2. Go to "Deployments" tab
3. Find "Deploy Webhooks"
4. Create webhook
5. Copy the URL

## 📝 Environment-Specific Features

### Production Only
```javascript
if (process.env.NODE_ENV === 'production') {
  // Enable production optimizations
  app.use(compression());
  app.use(helmet());
  
  // Stricter rate limiting
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
  }));
  
  // Production error handling (no stack traces)
  app.use(productionErrorHandler);
}
```

### Staging Only
```javascript
if (process.env.NODE_ENV === 'staging') {
  // Basic auth for staging
  if (process.env.STAGING_AUTH_PASSWORD) {
    app.use(basicAuth({
      users: { 
        [process.env.STAGING_AUTH_USER]: process.env.STAGING_AUTH_PASSWORD 
      },
      challenge: true
    }));
  }
  
  // More verbose logging
  app.use(verboseLogger);
  
  // Test features
  if (process.env.ENABLE_NEW_FEATURES === 'true') {
    app.use('/beta', betaFeaturesRouter);
  }
}
```

### Development Only
```javascript
if (process.env.NODE_ENV === 'development') {
  // Hot reload
  app.use(hotReloadMiddleware);
  
  // CORS for all origins
  app.use(cors({ origin: true }));
  
  // Detailed error stack traces
  app.use(developmentErrorHandler);
}
```

## ✅ Verification Checklist

After setting up environment variables:

### 1. Test Database Connection
```bash
railway run --environment production node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT NOW()').then(r => console.log('✅ DB Connected:', r.rows[0]));
"
```

### 2. Test JWT Generation
```bash
railway run --environment production node -e "
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ test: true }, process.env.JWT_SECRET);
  console.log('✅ JWT works:', !!token);
"
```

### 3. Test Redis Connection (if using)
```bash
railway run --environment production node -e "
  const redis = require('redis');
  const client = redis.createClient({ url: process.env.REDIS_URL });
  client.connect().then(() => {
    console.log('✅ Redis connected');
    client.quit();
  });
"
```

### 4. Verify Feature Flags
```bash
railway run --environment production node -e "
  console.log('Features:', {
    tournaments: process.env.ENABLE_TOURNAMENTS === 'true',
    ai: process.env.ENABLE_AI_PLAYERS === 'true',
    new: process.env.ENABLE_NEW_FEATURES === 'true'
  });
"
```

## 🔄 Migrating from .env Files

If you currently have .env files with real credentials:

1. **Copy values to Railway dashboard** (one by one)
2. **Delete .env files** with real credentials
3. **Clear git history** if credentials were committed:
   ```bash
   # WARNING: This rewrites history
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch backend/.env" \
     --prune-empty --tag-name-filter cat -- --all
   ```
4. **Force push** (coordinate with team):
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```

## 🚨 Emergency Variables

Keep these in a secure password manager for emergencies:

```yaml
Emergency Access:
  - Railway API Token: [STORE SECURELY]
  - Database Backup Credentials: [STORE SECURELY]
  - Admin User Password: [STORE SECURELY]
  - Rollback Webhook: [STORE SECURELY]
```

## 📊 Monitoring Environment Variables

Add these for better observability:

```bash
# Application Performance Monitoring
NEW_RELIC_APP_NAME=conquestk-production
NEW_RELIC_LICENSE_KEY=

# Log Aggregation
LOGTAIL_SOURCE_TOKEN=
PAPERTRAIL_HOST=
PAPERTRAIL_PORT=

# Error Tracking
BUGSNAG_API_KEY=
ROLLBAR_ACCESS_TOKEN=

# Analytics
GOOGLE_ANALYTICS_ID=
MIXPANEL_TOKEN=
```

## 🔐 Security Best Practices

1. **Rotate secrets regularly** (every 90 days)
2. **Use different secrets** for each environment
3. **Never log secrets** even in debug mode
4. **Audit access** to Railway dashboard monthly
5. **Use strong secrets** (minimum 32 characters)
6. **Enable 2FA** on Railway account
7. **Limit team access** to production variables

## 📝 Variable Documentation Template

When adding new variables, document them:

```markdown
### VARIABLE_NAME
- **Purpose**: What this variable controls
- **Type**: string | number | boolean
- **Required**: Yes/No
- **Default**: Default value if any
- **Example**: Safe example value
- **Notes**: Any special considerations
```

## 🆘 Troubleshooting

### Variable not working?
1. Check spelling (case-sensitive!)
2. Verify in Railway dashboard
3. Restart service after changes
4. Check logs for errors

### Database connection issues?
```bash
# Test from Railway
railway run --environment production psql $DATABASE_URL

# Check connection string format
echo $DATABASE_URL
# Should be: postgresql://user:pass@host:port/database
```

### JWT/Session errors?
- Ensure secrets are at least 32 characters
- Check they're different between environments
- Verify Base64 encoding if used

---

Remember: **Environment variables are the keys to your kingdom. Protect them accordingly!**