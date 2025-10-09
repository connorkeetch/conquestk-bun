# Backend ESM Migration — Stage 1 (Prep)

Goal: Prepare the codebase for a clean switch to Node ESM (NodeNext) without risking runtime or test regressions. We add tooling to make the later change mechanical and low‑risk, but do not flip the module system yet.

What’s included
- Codemod to add explicit `.js` extensions to relative imports (required by NodeNext):
  - `scripts/codemods/ensure-import-extensions.mjs`
  - Dry‑run: `npm run codemod:esm:check`
  - Apply: `npm run codemod:esm:apply`
- Scanner to find lingering `require(...)` usage:
  - `scripts/codemods/scan-requires.mjs`
  - Run: `npm run scan:requires`
- Focused refactors already done where safe (no behavior change):
  - Replaced a handful of dynamic `require(...)` with `import` or `await import` in non‑critical modules.
  - Ensured TS types compile cleanly after these changes.

How to use (local)
1) Review what will change
   - `npm run codemod:esm:check` — lists files where `.js` would be appended to relative imports.
   - `npm run scan:requires` — lists remaining `require(...)` sites by kind (core module, package, local).
2) When you’re ready to proceed, apply suffixes in a branch:
   - `git checkout -b chore/backend-esm-stage-1`
   - `npm run codemod:esm:apply`
   - `npm run typecheck:backend && npm run test:backend`

Recommended Stage 2 steps (separate PR)
- Flip the backend to ESM:
  - backend/tsconfig.json → `module: "NodeNext"`, `moduleResolution: "NodeNext"`
  - backend/package.json → add `"type": "module"`
  - Convert remaining `require(...)` sites (see `npm run scan:requires` output):
    - Core + packages → switch to `import` at top of files
    - Local files → prefer `import` or `await import`
  - Ensure all relative imports end with `.js` (codemod already prepared this)
- Jest config for ESM:
  - Option A: keep `ts-jest` + NodeNext; ensure `transformIgnorePatterns` handles any ESM deps.
  - Option B: run tests on built output (dist) with native Node ESM.
- After ESM is stable, bump `uuid` to `^13` and remove the temporary local UUID validator in `adminService`.

Notes & gotchas
- `connect-redis` types expect CommonJS interop; keep its `require('connect-redis')` until Stage 2 resolves store typings.
- `node-fetch` is removed; Node 22+ provides a global `fetch`.
- For dynamic imports used to break cyclic edges, keep `await import` (it works under both CJS+ts-jest and ESM).

Rollback
- This stage does not flip the module system. If any issue appears after applying the codemod, simply revert the branch changes and re‑run tests.

