# 🧼 Codebase Cleanup Plan

_Last updated: September 21, 2025_

This document tracks the non-functional tidy-up work that keeps the repository lean. Treat it as a living checklist—when you finish an item, move it to **Completed housekeeping** so the active list stays short.

## Status summary
| Area | Status | Notes |
| --- | --- | --- |
| Legacy root clutter | ✅ | Screenshot, maps.mhtml, and other stray files have been removed from the repo. |
| Sample/unused directories | ✅ | `logs/` and `tests-examples/` were deleted; keep an eye out if tooling recreates them locally. |
| Audio asset duplication | ✅ | All legacy audio/media assets were removed from the repo; the app now streams from R2 `static/**` exclusively. |
| Backend deployment scripts | ✅ | Legacy consolidated deploy helpers were removed; production deploys rely on the standard Railway migration flow. |
| Production backup artefacts | ✅ | Repo no longer tracks SQL dumps and `.gitignore` now excludes `backend/backups/` to prevent regressions. |
| Git hygiene | 🟡 | Large binary guards are still manual. Evaluate adding a pre-commit size check or Git LFS for anything over ~25 MB (the WAV variants noted in `audioService` are prime candidates). |

## Active tasks
1. **Strengthen large-file safeguards**
   Introduce Git LFS or a lightweight pre-commit hook to block >25 MB media assets before they land—especially if we keep high-quality WAV masters alongside compressed MP3s.

## Completed housekeeping
- Removed obsolete root artefacts (`Screenshot 2025-09-10 094449.png`, `maps.mhtml`, `test-audio.html`).
- Deleted empty `logs/` and Playwright sample directories that crept in during scaffolding.
- Normalised audio assets into Cloudflare R2 (`static/audio/**`) and removed all legacy MP3/WAV bundles from the repo.
- Moved manual upload utilities into the `tests/` area (no longer sitting in the repository root).
- Removed the obsolete consolidated deployment scripts and their npm aliases; `.gitignore` now blocks accidental `backend/backups/` commits while Railway handles production backups.

## Notes for future updates
- When you finish an item, add a short note under **Completed housekeeping** so we retain context for why it changed.
- If new clutter appears, add it to **Active tasks** with a one-line justification and a suggested owner.
