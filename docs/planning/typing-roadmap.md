# Backend Typing Roadmap

_Last updated: September 21, 2025_

## Snapshot (September 21, 2025)
- **Compiler configuration:** `backend/tsconfig.json` keeps `strict` mode enabled while still disabling `useUnknownInCatchVariables`, which lets legacy error handlers treat caught values as `any`.
- **Test runner diagnostics:** `ts-jest` is configured with `diagnostics: false`, so TypeScript errors are still suppressed during Jest runs until downstream fixes land.
- **Lint baseline:** `npx biome check backend --reporter summary` currently surfaces 64 errors and 117 warnings, concentrated in socket tests, legacy route handlers, and services that still rely on untyped data structures.
- **Domain models:** Core gameplay actions now use discriminated unions (`DeployAction`, `AttackAction`, etc.), and the game engine enforces exhaustiveness when processing actions, giving us the type safety foundation needed for stricter diagnostics.
- **Known `any` hotspots:** `UserService` still accepts and returns untyped payloads for creation and password reset flows, and the Redis cluster service exposes untyped event payloads and cache setters, so these remain priority clean-up targets.
- **Auth surface gap:** Middleware guarantees `req.userId`, but `AuthenticatedRequest` leaves the field optional, so downstream handlers and tests continue to widen types unnecessarily.

## Phase summary
| Phase | Status | Target window | Notes |
| --- | --- | --- | --- |
| Phase 0 – Baseline hardening | ✅ Complete | Finished September 21, 2025 | Strict compiler settings verified; gameplay unions in place. |
| Phase 1 – Guard rails | 🟡 In progress | September 23 – September 30, 2025 | Re-enable diagnostics once high-noise suites are fixed and align request typings. |
| Phase 2 – Domain typing | 🟡 In progress | October 1 – October 18, 2025 | Replace remaining `any` surfaces and type queue/worker payloads. |
| Phase 3 – Platform surfaces | ⚪ Not started | October 21 – November 15, 2025 | Harden admin, map workflow, and notification DTOs. |
| Phase 4 – Enforcement | ⚪ Not started | November 18 – December 6, 2025 | Turn lint/test diagnostics back into CI gates. |

### Phase 0 – Baseline hardening (✅ complete)
- Gameplay actions are modeled as discriminated unions and consumed exhaustively inside `GameEngine.processAction`, preventing new action variants from slipping through without compiler support.
- `GameService` persists typed game states via the cache helper and enforces typed turn mutations, ensuring we can safely enable stricter diagnostics later.

### Phase 1 – Guard rails (🟡 in progress — target September 30, 2025)
- **Re-enable Jest diagnostics:** Clean up the Biome-reported gaps in socket/game tests (`backend/src/test/socketService.test.ts`, `backend/test/setupTests.ts`) so we can flip `diagnostics: false` to `true` without breaking CI.
- **Request typing audit:** Update `AuthenticatedRequest` to require `userId` (middleware already guarantees the value) and backfill guards where unauthenticated routes still assume optionality.
- **Document hot spots:** Track remaining `any` usage in shared services (`userService`, `redisClusterService`) so teams know which areas block diagnostics from being re-enabled.

### Phase 2 – Domain typing (🟡 in progress — target October 18, 2025)
- **Replace service `any`s:** Define explicit DTOs for `UserService.create`, password reset lookups, and Redis cache setters to remove the broad `any` signatures that leak through request handlers.
- **Queue and worker payloads:** Tighten the Bull queue setup so event handlers and worker callbacks expose real payload interfaces instead of generic objects (e.g., Redis "node error" handler, cache tier wrappers).
- **Test utilities:** Introduce typed factories for socket/game fixtures so unit tests no longer rely on implicit any structures, eliminating the majority of Biome’s undeclared-variable diagnostics.

### Phase 3 – Platform surfaces (⚪ not started — target November 15, 2025)
- **Admin & map workflows:** Formalize request/response contracts for admin, map approval, and staging flows that still lean on implicit casting, aligning them with the shared type definitions before expanding enforcement.
- **Notification & feature flag DTOs:** Promote the notification dispatcher and Slack channel payloads to shared DTOs so frontend/backends stay synchronized when new properties are added.

### Phase 4 – Enforcement (⚪ not started — target December 6, 2025)
- **CI gating:** Once the earlier phases land, flip Biome and Jest back to failing on new `any` usage or untyped imports and re-enable `useUnknownInCatchVariables` so thrown values default to `unknown`.
- **Legacy script cleanup:** Migrate outstanding scripts (schema checks, slack notifications) off loose JSON blobs so formatting and lint passes can run cleanly in automated pipelines.

### Immediate next actions
1. Resolve the Biome violations in socket/game tests and rerun the suite to verify that enabling `ts-jest` diagnostics is safe by the end of September.
2. Update `AuthenticatedRequest` to require `userId` and adjust affected handlers/tests, closing the gap between middleware guarantees and route typings.
3. Draft DTOs for `UserService.create` inputs and Redis cache tier payloads to eliminate the largest remaining `any` surfaces before moving on to worker/notification typing.
