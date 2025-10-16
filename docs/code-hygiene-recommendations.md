# Code Hygiene & Consolidation Recommendations

Based on a comprehensive codebase review, here are prioritized recommendations for improving code quality and reducing technical debt.

## 🔴 High Priority

### 1. Consolidate Duplicate Lifecycle Handlers (~100 lines)
**Location:** `frontend/src/services/socketService.ts` lines 1401-1718

Both `lifecycle:update` and `room-update` socket handlers have ~80% code overlap:
- Both update room status
- Both trigger game state fetches
- Both prune archived conversations
- Both add game-start notifications

**Action:** Extract common logic into `handleRoomLifecycleChange()` helper function.

**Estimated savings:** ~100 lines of duplicate code

---

### 2. Standardize Error Handling in Socket Service
**Issue:** Inconsistent error handling patterns throughout socketService.ts

Three different patterns used:
```typescript
// Pattern 1: Silent with comment
catch { /* ignore */ }

// Pattern 2: Silent without explanation
catch { }

// Pattern 3: Logs error
catch (error) { logger.error(...) }
```

**Action:**
- Always log errors at minimum (even if continuing)
- Document why errors are being swallowed
- Consider error recovery strategies vs silent failures

**Files:**
- `frontend/src/services/socketService.ts`
- `backend/src/services/socketService.ts`

---

### 3. Replace Console.log with Logger (30 instances)
**Issue:** Backend still uses console.log instead of standardized logger

**Files:**
- `backend/src/scripts/squashMigrations.ts` (15 instances)
- `backend/src/scripts/checkFeatureFlags.ts` (13 instances)
- `backend/src/game/gameEngine.ts` (2 instances)

**Action:** Replace all `console.log/warn/error` with `logger` utility for:
- Consistent log levels
- Structured logging
- Production log filtering

---

## 🟡 Medium Priority

### 4. Address TODOs in GameService (6 critical gaps)
**Location:** `backend/src/services/gameService.ts`

Incomplete features marked with TODO:
- **Line 3242:** Game state not stored in database
- **Line 3299:** ELO rating updates not implemented
- **Line 3304:** Battle results not recorded in database
- **Line 3313:** Idle game queries not implemented
- **Line 3346:** Stale game detection not implemented
- **Line 283 (mapStagingService):** Physical file deletion not implemented

**Impact:** Data persistence gaps affect analytics and player experience.

**Action:** Create tickets for each TODO and prioritize database persistence work.

---

### 5. Reduce Type Safety Bypasses (271 instances)
**Issue:** Extensive use of `as any`, `as unknown`, `@ts-ignore` weakens type safety

**Hotspots:**
- `frontend/src/services/socketService.ts`: 21 bypasses
- `backend/src/services/gameService.ts`: 24 bypasses
- `frontend/src/pages/GameRoom.tsx`: 18 bypasses
- `frontend/src/components/chat/GameLogPanel.tsx`: 7 bypasses

**Action:**
1. Audit critical paths first (socket & game services)
2. Replace `as any` with proper type narrowing
3. Fix root cause of type mismatches vs suppressing

**Benefit:** Catch bugs at compile time, improve IDE autocomplete.

---

### 6. Extract Magic Numbers to Named Constants
**Progress:**
- `frontend/src/services/socketService.ts` now centralizes all timings (heartbeat, retries, toast durations, throttles) via named constants at the top of the file.
- Backend real-time services (`gameLifecycleService`, `gameActionProcessor`, `cleanupWorker`) expose lock timeouts and scheduling intervals through module-level constants.

**Next targets:** evaluate other runtime modules (e.g., maintenance/metrics services) and lift remaining hard-coded durations into named constants or shared config where useful.

---

## 🟢 Low Priority (Technical Debt)

### 7. Remove Legacy/Deprecated Code
**Deprecated socket events:**
- Comments say "legacy events fully retired" but handlers remain
- `game:snapshot` marked legacy but still used for join/resync

**Deprecated field names:**
- `continent` → `sector` (with @deprecated tags)
- `continentBonuses` → `sectorBonuses`
- Legacy field support adds maintenance burden

**Action:**
- Remove commented-out event handlers
- Create migration to eliminate deprecated field aliases
- Update clients to use new field names

---

### 8. Review Biome Linter Suppressions (27 instances)
**Issue:** `// biome-ignore` comments suppress lint warnings

Many are justified (e.g., event passthrough code), but some may be fixable:
- 5 suppressions in `frontend/src/services/socketService.ts`
- Most are for `any` types in generic event handlers

**Action:** Audit each suppression:
1. Document why suppression is necessary
2. Fix underlying issue if possible
3. Keep only justified suppressions with explanations

---

### 9. Add Documentation to Complex Methods
**Missing JSDoc on critical logic:**
- `processDelta()` (170+ lines) - complex delta application logic
- Delta sequence checking - gap recovery strategy not explained
- Optimistic update/rollback mechanics - not documented inline
- Heartbeat monitoring logic - zombie detection not explained

**Action:** Add JSDoc comments explaining:
- Algorithm overview
- Edge cases handled
- Error recovery strategies
- Examples of expected input/output

**Example:**
```typescript
/**
 * DELTA SEQUENCE TRACKING
 *
 * Detects gaps in delta sequence numbers to identify missed updates.
 * When a gap is detected (e.g., received seq 105 but last was 102),
 * requests missing deltas from server or triggers full state refetch.
 *
 * @param roomId - Game room identifier
 * @param delta - Incoming delta with version number
 * @returns true if delta should be processed, false if duplicate
 */
private async checkDeltaSequence(...)
```

---

### 10. Delete Confirmed Orphaned Code
**Documented in:** `docs/analysis/orphaned-code-*.md`

Ready for deletion:
- Legacy map components (`ResponsiveMapContainer.tsx`, `MapImageControls.tsx`)
- Old auth guards (`ProtectedRoute.tsx`)
- Deprecated game room panels (7 components)
- Legacy profile components (`EditableProfile.tsx`, `UserMenu.tsx`)

**Action:**
1. Verify components are truly unused (grep for imports)
2. Delete files in batch commit
3. Update documentation to remove references

**Benefit:** Reduce codebase size, eliminate confusion about which components to use.

---

## Summary of Quick Wins

Can be done in ~1-2 hours:
1. ✅ Extract constants for magic numbers (30 min)
2. ✅ Replace console.log with logger (30 min)
3. ✅ Consolidate duplicate lifecycle handlers (45 min)
4. ✅ Delete confirmed orphaned files (15 min)

Total estimated savings: ~200 lines of code, improved maintainability.

---

## Impact Priority Matrix

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Consolidate lifecycle handlers | Low | High | 🔴 Do first |
| Standardize error handling | Medium | High | 🔴 Do first |
| Replace console.log | Low | Medium | 🟡 Do soon |
| Address gameService TODOs | High | High | 🟡 Track/plan |
| Reduce type bypasses | High | Medium | 🟡 Incremental |
| Extract magic numbers | Low | Low | 🟢 Nice to have |
| Remove legacy code | Low | Low | 🟢 Nice to have |
| Add documentation | Medium | Low | 🟢 Nice to have |
| Review lint suppressions | Medium | Low | 🟢 Nice to have |
| Delete orphaned code | Low | Low | 🟢 Nice to have |

---

## Metrics

**Current state:**
- 271 type safety bypasses across 78 files
- 30 console.log statements in backend
- ~200 lines of duplicate code in lifecycle handlers
- 6 critical TODOs in game service
- 27 linter suppressions
- ~15 orphaned components documented

**After quick wins:**
- ~130 fewer lines of code
- 100% structured logging
- Reduced duplicate code by 50%
- All magic numbers named

---

## Next Steps

1. **Someone else** can work on Phase 3 docs implementation (idempotency, metrics, etc.)
2. **Immediate action:** Tackle high-priority items (lifecycle handlers, error handling, logging)
3. **Track TODOs:** Create GitHub issues for gameService persistence gaps
4. **Incremental cleanup:** Address type bypasses during regular development

The codebase is already in good shape after the socket reliability work. These recommendations focus on maintainability and reducing technical debt for long-term health.
