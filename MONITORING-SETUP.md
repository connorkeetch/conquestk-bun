# Monitoring & Alerting Setup

## 🔍 Overview
This guide sets up comprehensive monitoring for the Risk Game application across development, staging, and production environments.

## 📊 Monitoring Stack

### 1. Uptime Monitoring (UptimeRobot)
**Purpose**: Detect when the site goes down

```yaml
Monitors:
  - Name: ConquestK Production
    URL: https://conquestk.com/health
    Interval: 5 minutes
    Alert: Immediately
    
  - Name: ConquestK Staging
    URL: https://risk-game-production-9935.up.railway.app/health
    Interval: 15 minutes
    Alert: After 2 failures
```

**Setup**:
1. Create free account at https://uptimerobot.com
2. Add monitors for both endpoints
3. Configure alerts to email/SMS/Slack

### 2. Error Tracking (Sentry)
**Purpose**: Catch and track application errors

**Backend Integration**:
```typescript
// backend/src/config/sentry.ts
import * as Sentry from "@sentry/node";

export function initSentry() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app }),
      ],
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
  }
}
```

**Frontend Integration**:
```typescript
// frontend/src/config/sentry.ts
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### 3. Application Metrics (Railway Built-in)
**Purpose**: Monitor resource usage and performance

Railway provides:
- CPU usage
- Memory consumption
- Network traffic
- Request/response times
- Database query performance

Access at: https://railway.app/project/[PROJECT_ID]/service/[SERVICE_ID]/metrics

### 4. Custom Health Endpoint
**Implementation**:
```typescript
// backend/src/routes/health.ts
import { Router } from 'express';
import { query } from '../config/database';
import { redis } from '../config/redis';

const router = Router();

router.get('/health', async (req, res) => {
  const checks = {
    server: 'ok',
    database: 'unknown',
    redis: 'unknown',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version,
  };

  try {
    // Check database
    await query('SELECT 1');
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'error';
  }

  try {
    // Check Redis
    if (redis) {
      await redis.ping();
      checks.redis = 'ok';
    }
  } catch (error) {
    checks.redis = 'error';
  }

  const statusCode = 
    checks.database === 'ok' && 
    (checks.redis === 'ok' || checks.redis === 'unknown') 
      ? 200 
      : 503;

  res.status(statusCode).json(checks);
});

router.get('/health/detailed', async (req, res) => {
  // Protected endpoint with more details
  if (req.headers.authorization !== `Bearer ${process.env.HEALTH_CHECK_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const details = {
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    connections: {
      database: await query('SELECT count(*) FROM pg_stat_activity'),
      activeSockets: io.engine.clientsCount,
    },
    gameStats: {
      activeGames: await query('SELECT count(*) FROM games WHERE status = $1', ['in_progress']),
      onlineUsers: await query('SELECT count(*) FROM users WHERE last_seen > NOW() - INTERVAL \'5 minutes\''),
    },
  };

  res.json(details);
});

export default router;
```

## 📈 Key Metrics to Monitor

### Response Time Thresholds
- **Excellent**: < 200ms
- **Good**: 200-500ms
- **Acceptable**: 500-1000ms
- **Poor**: > 1000ms

### Error Rate Thresholds
- **Normal**: < 0.1%
- **Warning**: 0.1-1%
- **Critical**: > 1%

### Database Performance
```sql
-- Slow query log
CREATE TABLE query_performance_log (
  id SERIAL PRIMARY KEY,
  query_text TEXT,
  execution_time_ms INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monitor connection pool
SELECT 
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active,
  count(*) FILTER (WHERE state = 'idle') as idle
FROM pg_stat_activity
WHERE datname = 'risk_game';
```

### Memory Usage
- **Warning**: > 80% of allocated
- **Critical**: > 90% of allocated

## 🚨 Alert Configuration

### Priority Levels
1. **P0 (Critical)**: Site down, data loss risk
   - Alert: Immediately
   - Channels: SMS, Phone call, Slack
   
2. **P1 (High)**: Major feature broken
   - Alert: Within 5 minutes
   - Channels: Email, Slack
   
3. **P2 (Medium)**: Performance degradation
   - Alert: Within 15 minutes
   - Channels: Email
   
4. **P3 (Low)**: Minor issues
   - Alert: Daily digest
   - Channels: Email

### Alert Rules
```yaml
Rules:
  - name: Site Down
    condition: HTTP status != 200 for 2 consecutive checks
    priority: P0
    
  - name: High Error Rate
    condition: Error rate > 1% for 5 minutes
    priority: P1
    
  - name: Slow Response
    condition: p95 response time > 2s for 10 minutes
    priority: P2
    
  - name: Database Connection Pool Exhausted
    condition: Available connections < 2
    priority: P1
    
  - name: Memory Leak Suspected
    condition: Memory usage increasing 10% per hour
    priority: P2
```

## 📱 Status Page

### Public Status Page (status.conquestk.com)
```html
<!DOCTYPE html>
<html>
<head>
  <title>ConquestK Status</title>
  <meta http-equiv="refresh" content="60">
</head>
<body>
  <h1>System Status</h1>
  <div id="status"></div>
  <script>
    fetch('https://conquestk.com/health')
      .then(r => r.json())
      .then(data => {
        document.getElementById('status').innerHTML = `
          <p>🟢 API: ${data.server}</p>
          <p>${data.database === 'ok' ? '🟢' : '🔴'} Database: ${data.database}</p>
          <p>${data.redis === 'ok' ? '🟢' : '🟡'} Cache: ${data.redis}</p>
          <p>Last checked: ${new Date().toLocaleTimeString()}</p>
        `;
      })
      .catch(() => {
        document.getElementById('status').innerHTML = '🔴 Service Unavailable';
      });
  </script>
</body>
</html>
```

## 📝 Incident Response Playbook

### When Site Goes Down
1. **Verify** - Check from multiple locations
2. **Diagnose** - Check Railway logs
3. **Communicate** - Update status page
4. **Fix** - Apply hotfix or rollback
5. **Monitor** - Watch for 30 minutes post-fix
6. **Report** - Create incident report

### Incident Report Template
```markdown
## Incident Report - [Date]

**Duration**: [Start time] - [End time]
**Impact**: [Number of users affected]
**Severity**: P0/P1/P2/P3

### Timeline
- [Time]: Issue detected
- [Time]: Root cause identified
- [Time]: Fix deployed
- [Time]: Service restored

### Root Cause
[Description of what caused the issue]

### Resolution
[How the issue was fixed]

### Action Items
- [ ] [Preventive measure 1]
- [ ] [Preventive measure 2]
```

## 🔧 Monitoring Commands

### Quick Health Checks
```bash
# Production health
curl https://conquestk.com/health | jq

# Staging health
curl https://risk-game-production-9935.up.railway.app/health | jq

# Database connections
railway run --environment production psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity"

# Active games
railway run --environment production psql $DATABASE_URL -c "SELECT count(*) FROM games WHERE status='in_progress'"
```

### Performance Testing
```bash
# Load test with Apache Bench
ab -n 1000 -c 10 https://conquestk.com/health

# Monitor response times
while true; do
  time curl -s https://conquestk.com/health > /dev/null
  sleep 5
done
```

## 🔄 Log Aggregation

### Railway Logs
- Access via Railway dashboard
- Use filters for error levels
- Set up log drains to external services

### Custom Logging
```typescript
// backend/src/utils/logger.ts
import winston from 'winston';
import { Logtail } from '@logtail/node';

const logtail = new Logtail(process.env.LOGTAIL_TOKEN);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Send to Logtail in production
if (process.env.NODE_ENV === 'production') {
  logger.add(logtail.winston());
}
```

## 📊 Dashboard Setup

### Grafana Dashboard (Optional)
```json
{
  "dashboard": {
    "title": "ConquestK Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [{"query": "rate(http_requests_total[5m])"}]
      },
      {
        "title": "Error Rate",
        "targets": [{"query": "rate(http_errors_total[5m])"}]
      },
      {
        "title": "Response Time p95",
        "targets": [{"query": "histogram_quantile(0.95, http_request_duration_seconds)"}]
      },
      {
        "title": "Active Games",
        "targets": [{"query": "games_active_total"}]
      }
    ]
  }
}
```

## 🎯 Monitoring Checklist

### Daily
- [ ] Check uptime percentage
- [ ] Review error logs
- [ ] Check response times
- [ ] Monitor active users

### Weekly
- [ ] Review performance trends
- [ ] Check database query performance
- [ ] Analyze error patterns
- [ ] Update status page

### Monthly
- [ ] Full system health audit
- [ ] Review incident reports
- [ ] Update alert thresholds
- [ ] Test disaster recovery

## 🚀 Getting Started

1. **Set up UptimeRobot**
   ```
   - Create account
   - Add monitors for production and staging
   - Configure email alerts
   ```

2. **Install Sentry**
   ```bash
   npm install @sentry/node @sentry/react
   ```

3. **Add environment variables**
   ```env
   SENTRY_DSN=your-sentry-dsn
   HEALTH_CHECK_TOKEN=random-secure-token
   LOGTAIL_TOKEN=your-logtail-token
   ```

4. **Deploy health endpoint**
   - Add health routes
   - Test endpoints
   - Configure monitors

5. **Set up alerts**
   - Configure Slack webhook
   - Set up PagerDuty (optional)
   - Test alert flow

## 📞 Escalation Chain

1. **Level 1**: Automated alerts → On-call developer
2. **Level 2**: No response in 15 mins → Team lead
3. **Level 3**: No response in 30 mins → CTO/Product owner

## 🔑 Important URLs

- **Production**: https://conquestk.com
- **Staging**: https://risk-game-production-9935.up.railway.app
- **Railway Dashboard**: https://railway.app/dashboard
- **Status Page**: https://status.conquestk.com (to be configured)
- **Sentry**: https://sentry.io/organizations/[YOUR_ORG]
- **UptimeRobot**: https://uptimerobot.com/dashboard