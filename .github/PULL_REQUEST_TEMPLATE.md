## Summary

Explain what changed and why.

## Development-only Checklist

- [ ] I followed the development-only policy (prefer clean refactors over backward compatibility; destructive migrations allowed).
- [ ] If this includes a migration, I ran `cd backend && npm run migrate` locally and reseeded if needed (`npm run seed:users`).
- [ ] I removed or updated deprecated sockets/routes instead of adding new shims.
- [ ] I coordinated FE/BE changes in this PR (no long deprecation window needed right now).
- [ ] I updated documentation if behavior changed (AGENTS.md, CLAUDE.md, README/docs as appropriate) and kept AGENTS/CLAUDE in sync.
- [ ] I considered the soft-launch target (Oct 24, 2025) and avoided risky multi-step changes immediately before planned play sessions.

## Testing

List manual and automated checks. Include any screenshots/logs if relevant.

## Migrations / Rollback

- Migration(s): describe the change briefly.
- Rollback strategy: short note (e.g., apply reverse migration, reseed, or restore from backup).

