# Typing Roadmap

This document captures a phased plan to reintroduce strict TypeScript typing across the backend without breaking day-to-day development.

## Phase 0 – Current Baseline
- Jest now transpiles without static type diagnostics (`jest.config.js`).
- Many modules continue to rely on `any`-like behaviour (e.g. `GameAction.payload`, `gameService` helpers).
- Biome still enforces style rules but emits thousands of existing warnings/errors outside the scope of the recent refactor.

## Phase 1 – Guard Rails
- Re-enable `ts-jest` diagnostics once high-value domains are typed (target: game engine + services).
- Add runtime guards per route to ensure `req.userId` (and similar) is present before reaching services.
- Document temporary `any` hot spots so they can be revisited (`GameService`, `territoryModifierService`, legacy scripts).

## Phase 2 – Domain Typing
- Restore strong types for core gameplay:
  - Replace `GameAction.payload` casts with discriminated unions per action.
  - Reintroduce typed return values for `GameEngine.processAction` and downstream service methods.
- Type the Redis/session adapters and worker payloads (convert `Record<string, any>` to dedicated interfaces).
- Provide mock factories in tests to satisfy stricter interfaces without excessive casting.

## Phase 3 – Platform Surfaces
- Type admin/map workflow payloads and responses (currently loosely typed Express handlers).
- Convert notification + feature flag services to shared DTOs in `shared/types` to align frontend/backend.
- Update Jest config to run with diagnostics after Phases 1–3 succeed locally.

## Phase 4 – Enforcement
- Bump Biome/Jest configs to fail on newly introduced `any` usages outside explicitly whitelisted files.
- Remove temporary tsconfig relaxations (`useUnknownInCatchVariables`, etc.).
- Revisit lint pipeline gating once legacy scripts are migrated to structured logging utilities.

Progress tracking now lives in [planning/ROADMAP.md](planning/ROADMAP.md) until a dedicated issue board is spun up.
