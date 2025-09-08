# Performance Optimizations Guide

This document outlines the performance optimizations implemented in ConquestK and provides guidelines for maintaining optimal performance when adding new features.

## Overview

ConquestK has been optimized for real-time multiplayer gameplay with the following key improvements:

- **Delta-based broadcasting** instead of full state updates (60% bandwidth reduction)
- **Redis caching** for game state and territory modifiers
- **Bulk database operations** to eliminate N+1 query problems
- **Enhanced connection pooling** for production loads

## Phase 1: Memory & Real-time Optimizations

### ✅ Redis Game State Caching
- **Pattern**: Use `gameStateCache` from `cacheService.ts` instead of in-memory Maps
- **TTL**: 1 hour active games, 24 hours inactive games
- **Auto-cleanup**: Finished games automatically cleaned up

```typescript
// ❌ Old Pattern - Memory leaks
private activeGames = new Map<string, GameState>()

// ✅ New Pattern - Redis cached
import { gameStateCache } from './cacheService'
const gameState = await gameStateCache.getGameState(roomId)
await gameStateCache.setGameState(roomId, updatedState)
```

### ✅ Delta Broadcasting System
- **Pattern**: Send only changed data instead of full game state
- **Implementation**: Use `DeltaBuilder` and `applyDelta` reducer
- **Backward compatibility**: Legacy events maintained during transition

```typescript
// ❌ Old Pattern - Full state broadcast
io.to(roomId).emit('game-update', fullGameState)

// ✅ New Pattern - Delta updates
const territoryDelta = DeltaBuilder.territoryUpdate(roomId, territoryId, { armies: newArmies })
io.to(roomId).emit('game-delta', territoryDelta)
```

## Phase 2: Database Query Optimizations

### ✅ Territory Modifier Caching & Batch Operations
- **Caching**: Use `territoryModifierCache` for templates, map modifiers, and game modifiers
- **Batch INSERTs**: Replace individual queries with bulk operations
- **Cache TTL**: 30 minutes templates, 2 hours map modifiers, 1 hour game modifiers

```typescript
// ❌ Old Pattern - Individual INSERTs
for (const modifier of modifiers) {
  await query('INSERT INTO game_territory_modifiers ...', [gameId, modifier.territory_id, ...])
}

// ✅ New Pattern - Batch INSERT
const values = modifiers.flatMap(m => [gameId, m.territory_id, m.defense_bonus, ...])
const placeholders = modifiers.map((_, i) => `($${i*10+1}, $${i*10+2}, ...)`).join(', ')
await query(`INSERT INTO game_territory_modifiers (...) VALUES ${placeholders}`, values)
```

### ✅ Bulk ELO Rating Updates
- **Pattern**: Use bulk UPDATE with CASE statements instead of individual queries
- **Rating History**: Batch INSERT all records at once
- **Player Fetching**: Single bulk query instead of per-player queries

```typescript
// ❌ Old Pattern - Individual updates
for (const change of changes) {
  await query('UPDATE users SET skill_rating = ? WHERE id = ?', [change.newRating, change.userId])
}

// ✅ New Pattern - Bulk update with CASE statements
const sql = `UPDATE users SET skill_rating = CASE 
  ${changes.map(c => `WHEN id = ? THEN ?`).join(' ')}
END WHERE id IN (?)`
```

### ✅ Enhanced Database Connection Pooling
- **Production**: 5-25 connections with keep-alive
- **Development**: 2-15 connections
- **Monitoring**: Real-time pool metrics available via `getPoolMetrics()`
- **Health**: Connection events logged for debugging

## Guidelines for New Features

### 1. Caching Strategy
Always consider caching for:
- Frequently accessed data (user profiles, game configs)
- Expensive computations (pathfinding, territory calculations)
- Static reference data (maps, templates, rules)

```typescript
// Template for new cache services
export class YourFeatureCache extends CacheService {
  private readonly CACHE_PREFIX = 'your_feature'
  private readonly DEFAULT_TTL = 1800 // 30 minutes

  async getFeatureData(id: string) {
    return this.get(`${this.CACHE_PREFIX}:${id}`)
  }

  async setFeatureData(id: string, data: any) {
    await this.set(`${this.CACHE_PREFIX}:${id}`, data, this.DEFAULT_TTL)
  }
}
```

### 2. Database Operations
Always use bulk operations when possible:
- **Multiple INSERTs**: Use VALUES with multiple rows
- **Multiple UPDATEs**: Use CASE statements
- **Multiple SELECTs**: Use IN clauses with arrays

### 3. Real-time Updates
Use delta updates for Socket.io events:
- Identify what changed (specific territories, players, etc.)
- Create targeted delta objects
- Apply changes efficiently on frontend
- Maintain backward compatibility during transitions

### 4. Query Optimization Checklist
- [ ] Can this be cached?
- [ ] Can multiple queries be combined?
- [ ] Are we fetching only needed columns?
- [ ] Do we have proper database indexes?
- [ ] Can we use prepared statements?

## Monitoring & Debugging

### Database Pool Metrics
```typescript
import { getPoolMetrics } from '../config/database'
const metrics = getPoolMetrics()
// Returns: totalCount, idleCount, waitingCount, utilization
```

### Cache Hit Rates
Monitor Redis cache performance in production to ensure effective caching strategies.

### Delta Update Verification
Use browser dev tools to monitor Socket.io events and verify delta updates are being used instead of full state broadcasts.

## Performance Targets

- **Database queries**: < 100ms average response time
- **Cache hit rate**: > 85% for frequently accessed data  
- **Socket.io bandwidth**: < 40% of previous full-state approach
- **Memory usage**: Stable without unbounded growth
- **Connection pool**: < 80% utilization during peak loads

## Next Steps (Phase 3)

- **Bull.js Queue System**: Async processing for CPU-intensive operations
- **Background Workers**: Move battle simulations and AI processing
- **Horizontal Scaling**: Prepare for multi-server deployment

## Troubleshooting

### High Database Connection Usage
- Check pool metrics with `getPoolMetrics()`
- Look for long-running transactions
- Ensure proper connection cleanup in error cases

### Cache Misses
- Verify TTL settings are appropriate
- Check if cache keys are consistent
- Monitor Redis memory usage and eviction policies

### Socket.io Performance Issues
- Verify delta updates are being used
- Check for memory leaks in client-side Redux store
- Monitor network bandwidth usage per connection

---

**Last Updated**: Phase 2 Optimizations Complete
**Next Review**: After Phase 3 implementation