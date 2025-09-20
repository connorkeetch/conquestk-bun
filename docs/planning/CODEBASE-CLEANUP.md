# 🧼 Codebase Cleanup Plan

_Last updated: February 15, 2025_

This document tracks the non-functional tidy-up work that keeps the repository lean. Treat it as a living checklist—when you finish an item, move it to **Completed housekeeping** so the active list stays short.

## Status summary
| Area | Status | Notes |
| --- | --- | --- |
| Legacy root clutter | ✅ | Screenshot, maps.mhtml, and other stray files have been removed from the repo. |
| Sample/unused directories | ✅ | `logs/` and `tests-examples/` were deleted; keep an eye out if tooling recreates them locally. |
| Audio asset organisation | ⚠️ | Main library now lives in `frontend/public/audio-files/`, but the legacy `frontend/public/audio files/` directory still exists and should be removed once references are confirmed. |
| Archived migrations | 🟡 | `backend/migrations/archived/` remains for reference; delete only after production stability is confirmed. |
| Backend maintenance scripts | 🟡 | Review `backend/scripts/backup-production.js` and the consolidated deploy scripts—decommission if Railway workflow supersedes them. |
| Git hygiene | ⚠️ | `.gitignore` covers logs generically, but consider adding audio artefacts or enforcing a pre-commit file size check. |

## Active tasks
1. **Retire legacy audio directory**  
   Verify no code paths still point to `/audio files/` (with a space) and remove the folder once safe. Update documentation and tests accordingly.
2. **Audit backend scripts**  
   Confirm whether the consolidated deployment scripts remain necessary after the Railway migration. Remove or document them if they are now redundant.
3. **Decide fate of archived migrations**  
   If we no longer rely on those SQL snapshots for reference, schedule their removal in a dedicated release so we can tag the state beforehand.
4. **Strengthen large-file safeguards**  
   Introduce either Git LFS for sizeable audio assets or a pre-commit hook that prevents >25 MB files from sneaking into the history.

## Completed housekeeping
- Removed obsolete root artefacts (`Screenshot 2025-09-10 094449.png`, `maps.mhtml`, `test-audio.html`).
- Deleted empty `logs/` and Playwright sample directories that crept in during scaffolding.
- Normalised audio assets into `frontend/public/audio-files/` and pruned duplicate MP3/WAV variants.
- Moved manual upload utilities into the `tests/` area (no longer sitting in the repository root).

## Notes for future updates
- When you finish an item, add a short note under **Completed housekeeping** so we retain context for why it changed.
- If new clutter appears, add it to **Active tasks** with a one-line justification and a suggested owner.
