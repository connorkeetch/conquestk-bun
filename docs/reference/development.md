# Development Guide

## 📋 Available Commands

### 🔧 Setup & Development
```bash
npm run setup              # Check and configure development environment
npm run dev                # Start both frontend and backend (PowerShell)
npm run dev:frontend       # Start frontend only
npm run dev:backend        # Start backend only
npm run dev:frontend-only  # Start frontend only (PowerShell)
npm run dev:backend-only   # Start backend only (PowerShell)
npm run dev:quick          # Start without setup check
npm run dev:manual         # Start with concurrently (no new windows)
```

### 🏗️ Build & Production
```bash
npm run build              # Build both frontend and backend
npm run build:frontend     # Build frontend only
npm run build:backend      # Build backend only
npm start                  # Start production backend
```

### 🧪 Testing & Quality
```bash
npm test                   # Run all tests
npm run test:frontend      # Run frontend tests
npm run test:backend       # Run backend tests
npm run lint               # Run Biome linting across every workspace
cd frontend && npm run lint  # Run frontend-only linting
cd backend && npm run lint   # Run backend-only linting
```

### 🎭 Playwright smoke tests
- Source files live in [`tests/`](../../tests) with the current smoke check at [`tests/smoke.spec.ts`](../../tests/smoke.spec.ts).
- Configuration lives at [`playwright.config.ts`](../../playwright.config.ts) and automatically starts the frontend dev server via `npm run dev:frontend`.
- Run the suite locally with `npx playwright test` (or `npx playwright test --ui` to inspect runs). The backend is not auto-started—launch it separately when a test needs API data.
- CI retries failed specs twice and records traces/screenshots on the first retry to aid debugging.

## 🚀 Backend Performance Practices

### Caching Playbook
- Prefer the shared Redis caches (`gameStateCache`, `territoryModifierCache`, etc.) over per-process Maps to keep horizontal instances in sync.
- Default TTLs are tuned for gameplay: 1 hour while a match is active, 24 hours when idle/finished, 30 minutes for templates, and 2 hours for map modifiers.
- When adding a new cache, follow the existing `CacheService` pattern:

```typescript
export class YourFeatureCache extends CacheService {
  private readonly CACHE_PREFIX = 'your_feature'
  private readonly DEFAULT_TTL = 1800 // 30 minutes

  async getFeatureData(id: string) {
    return this.get(`${this.CACHE_PREFIX}:${id}`)
  }

  async setFeatureData(id: string, data: unknown) {
    await this.set(`${this.CACHE_PREFIX}:${id}`, data, this.DEFAULT_TTL)
  }
}
```

### Bulk Database Operations
- Batch modifier writes with multi-row `INSERT` statements instead of looping individual queries.
- Use `UPDATE ... CASE` blocks to apply multiple skill rating changes in a single round-trip.
- Prefer `SELECT ... WHERE id = ANY($1)` over repeated lookups when gathering player or territory data.

### Real-time Delta Updates
- Socket events should emit deltas (`DeltaBuilder.*`) rather than entire game states to keep payloads lean.
- Pair broadcasted deltas with the frontend `applyDelta` reducer helpers so clients reconcile incremental changes safely.
- Maintain temporary legacy events only when absolutely necessary for backward compatibility.

### Query Optimization Checklist
- [ ] Can this response be cached in Redis?
- [ ] Can multiple INSERT/UPDATE/SELECT statements be combined?
- [ ] Are we selecting only the columns we need?
- [ ] Do we have appropriate indexes for the filters being used?
- [ ] Are we using prepared statements or parameterized queries?

### Performance Targets
- < 100 ms average database response time for synchronous routes.
- > 85% cache hit rate on frequently accessed game data.
- < 40% of prior bandwidth usage on Socket.io channels by sticking with delta updates.
- < 80% connection pool utilization during peak load (check `getPoolMetrics()` if unsure).

## 🤖 MCP Server Usage

### Available MCP Servers
- **Memory Server**: Store and search project context
- **Filesystem Server**: File operations with proper permissions
- **Git Server**: Advanced git operations and workflows
- **GitHub Server**: Repository management and PRs
- **Puppeteer Server**: Browser automation for testing
- **Fetch Server**: Web content retrieval and analysis

### Memory Integration Examples
```bash
# Search for specific project information
Search for "database schema" to see table structure
Search for "port conflicts" to get troubleshooting info
Search for "Map Editor" to understand editor features
```

## 🔧 Using Subagents

### Available Specialized Agents
- **memory-bank-synchronizer**: Keep documentation in sync with code
- **code-searcher**: Advanced code analysis and search
- **ux-design-expert**: UI/UX design guidance
- **code-reviewer**: Automated code review

### Usage Examples
```bash
# Sync documentation with current code state
Use memory-bank-synchronizer to update CLAUDE.md with current project state

# Search for specific patterns
Use code-searcher to find all socket.io event handlers

# Get UX feedback
Use ux-design-expert to review navigation component design
```

## 🔁 Upgrade & Maintenance Tips

- Check related package versions for compatibility before upgrading to avoid cascading peer dependency issues.
- Roll out major upgrades one dependency at a time so failures are easier to isolate and roll back.
- Keep TypeScript strict mode enabled to surface new type gaps alongside runtime changes.
- Document and rehearse a rollback plan prior to production upgrades so the team can recover quickly.
- When dependency graphs get messy, wipe modules (`rm -rf node_modules && npm install`) to ensure a clean rebuild.
- Treat enterprise-scale improvements as phased projects and budget time for full integration testing.
- Run `npm dedupe` after large upgrades to collapse duplicate dependency trees.
- Use `npm ls <package>` to spot version skews that slipped into the lockfile.
- Consider `npx npm-check-updates` to review upcoming releases before planning the next upgrade.
- Keep generated TypeScript types synchronized with their runtime libraries when updating APIs.
- Use the authenticated `GET /api/benchmark/baseline` endpoint to collect quick regression benchmarks after a release.【F:backend/src/routes/benchmarkRoutes.ts†L395-L424】
- Monitor `GET /api/performance/dashboard` for live health summaries once the backend is running.【F:backend/src/routes/performanceRoutes.ts†L33-L45】
