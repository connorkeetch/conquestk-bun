# Logging Standards and Best Practices

_Last updated: February 21, 2025_

## Overview
This document outlines the logging standards for the ConquestK codebase, explaining when and how to use different logging methods.

## Backend Logging (Node.js/Express)

### Winston Logger Setup
The backend uses Winston for structured logging with different outputs based on environment:

- **Production**: JSON format to console (for Railway log aggregation)
- **Development**: File logging (`logs/error.log`, `logs/combined.log`) + console

### Log Levels

#### `logger.error()`
Use for errors that need immediate attention:
- Database connection failures
- Critical service failures
- Unhandled exceptions
- Security violations

```typescript
logger.error('❌ Failed to initialize WorkerManager:', error)
```

#### `logger.warn()`
Use for non-critical issues that should be monitored:
- Fallback to degraded functionality
- Missing optional configuration
- Performance warnings
- Deprecated feature usage

```typescript
logger.warn('⚠️ Redis initialization failed, using in-memory adapters')
```

#### `logger.info()`
Use for important operational events:
- Service startup/shutdown
- Configuration changes
- User actions (login, logout)
- Major state changes

```typescript
logger.info('✅ Socket.io using Redis adapter for multi-server support')
```

#### `logger.debug()`
Use for detailed debugging information:
- Function entry/exit
- Variable values
- Detailed flow information
- Performance metrics

```typescript
logger.debug('Processing game action:', { gameId, action, playerId })
```

### Special Cases

#### Server Startup (index.ts)
Early startup logs (before logger initialization) must use `console.log`:
```typescript
// Lines 1-137: Before logger is loaded
console.log('📦 Loading core modules...')

// Line 137+: After logger is loaded
logger.info('✅ Utils loaded')
```

#### CLI Scripts
Scripts in `backend/src/scripts/` may use `console.log` for user-facing output:
- Interactive prompts
- Progress indicators
- Success/failure messages
- Tables and formatted output

Internal errors should still use logger when available.

### Route error helper

Recent service hardening introduced a shared `handleRouteError` utility (`backend/src/utils/routeErrorHandler.ts`). Use it in Express handlers whenever you need to:

- Log the failure with consistent structure and context
- Capture the exception in Sentry
- Avoid duplicating `logger.error` payloads across routes

Pass any request-specific identifiers through the optional `context` argument so the log line surfaces parameters like `queueName` or `userId` alongside the stack trace.

## Frontend Logging (React)

### Development vs Production

#### Development
Keep console.logs for debugging but use sparingly:
```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('[GameBoard] State updated:', newState)
}
```

#### Production
Remove or disable debug logs:
```typescript
// Use a debug flag
const DEBUG = process.env.NODE_ENV === 'development'
if (DEBUG) console.log('Debug info')

// Or create a simple logger utility
const log = {
  debug: (...args) => process.env.NODE_ENV === 'development' && console.log(...args),
  error: (...args) => console.error(...args), // Keep errors in production
}
```

### Frontend Logging Patterns

#### Component Lifecycle
```typescript
// Only in development
useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    console.log('[ComponentName] Mounted')
  }
  return () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ComponentName] Unmounted')
    }
  }
}, [])
```

#### API Calls
```typescript
// Always log errors
catch (error) {
  console.error('[API] Request failed:', error)
  // Also send to error tracking service in production
}
```

#### WebSocket Events
```typescript
socket.on('error', (error) => {
  console.error('[Socket] Error:', error)
})

// Debug events only in development
socket.on('game:update', (data) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Socket] Game update:', data)
  }
})
```

## Migration Status

### ✅ Completed
- **Core boot flow:** `index.ts` still uses `console.log` only before the logger is initialised.
- **Routes:** Queue, benchmark, preferences, terms, and skills routes now defer to `handleRouteError` for structured logging.
- **Workers:** `battleWorker`, `cleanupWorker`, `gameActionWorker`, and `workerManager` emit through the shared logger.
- **Services:** `UserPreferencesService`, `capitalGeneratorService`, and `featureFlagService` swapped remaining `console.log` calls for semantic logger levels.

### 🧭 Ongoing vigilance
- New routes should wire `handleRouteError` instead of hand-written `logger.error` calls.
- Background workers must use the shared logger instance so queue health metrics stay centralised.
- Keep CLI scripts user-friendly with `console.log`, but route operational failures through the logger for alerting.

### 📝 Scripts (Keep console.log)
CLI scripts should keep console.log for user interaction:
- `makeAdmin.ts`, `runMigration.ts`, `setupProductionAdmin.ts`
- `checkSchema.ts`, `diagnoseAdminIssue.ts`, `testEmail.ts`

## Best Practices

### 1. Use Semantic Log Levels
- Don't use `logger.info()` for errors
- Don't use `logger.error()` for warnings
- Reserve `logger.debug()` for verbose output

### 2. Include Context
```typescript
// Good
logger.error('Failed to process game action', { 
  gameId, 
  playerId, 
  action, 
  error: error.message 
})

// Bad
logger.error('Error occurred')
```

### 3. Use Emojis Consistently
- ✅ Success operations
- ❌ Errors and failures
- ⚠️ Warnings
- 🔄 In-progress operations
- 📦 Loading/initialization
- 🚀 Startup
- 📊 Metrics/stats

### 4. Avoid Logging Sensitive Data
Never log:
- Passwords
- API keys
- Session tokens
- Personal information (without consent)
- Credit card numbers

### 5. Performance Considerations
- Use `logger.debug()` for high-frequency logs
- Consider log sampling for very high-traffic endpoints
- Rotate log files in development to prevent disk issues

## Environment Variables

### LOG_LEVEL
Controls minimum log level (default: 'info'):
```bash
LOG_LEVEL=debug npm run dev  # Show all logs
LOG_LEVEL=error npm start    # Only errors in production
```

### Other Settings
- `EMAIL_ENABLED`: Controls email service logging
- `NODE_ENV`: Affects log format and verbosity

## Tools and Monitoring

### Local Development
```bash
# Watch error logs
tail -f backend/logs/error.log

# Watch all logs
tail -f backend/logs/combined.log

# Clear logs
rm backend/logs/*.log
```

### Production (Railway)
- Logs automatically aggregated by Railway
- Use Railway dashboard for log viewing
- JSON format enables structured queries

### Future Improvements
Consider implementing:
1. Structured logging with request IDs
2. Log aggregation service (e.g., Datadog, LogRocket)
3. Frontend error tracking (e.g., Sentry for React)
4. Performance monitoring integration
5. Custom log transport for specific services

## Summary

The key principle is thoughtful logging:
- **Backend**: Use Winston with appropriate levels
- **Frontend**: Minimize production logs, use conditional debug logs
- **Scripts**: Keep console.log for CLI interaction
- **Always**: Include context and avoid sensitive data

Remember: Logs are for debugging and monitoring, not for user communication!
