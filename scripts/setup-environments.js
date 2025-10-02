#!/usr/bin/env node
/*
  Cross‑platform environment scaffold for local development (WSL/macOS/Linux/Windows).
  - Creates backend/.env.local with local Postgres + Redis defaults
  - Optionally creates frontend/.env if missing
  - Ensures .gitignore ignores .env.local files
*/

const fs = require('node:fs')
const path = require('node:path')

function write(line) {
  process.stdout.write(`${line}\n`)
}

function ensureBackendEnvLocal() {
  const backendDir = path.join(__dirname, '..', 'backend')
  const envPath = path.join(backendDir, '.env.local')
  if (fs.existsSync(envPath)) {
    write('✓ backend/.env.local already exists (skipping)')
    return
  }

  const content = `# Local Development Environment (do not commit)
NODE_ENV=development
PORT=5001

# Frontend URLs
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173

# Local PostgreSQL (WSL/macOS/Windows)
DATABASE_URL=postgresql://postgres:localpassword123@127.0.0.1:5432/risk_game_local

# Development Secrets (use strong values locally)
JWT_SECRET=local-dev-jwt-secret-change-in-production
SESSION_SECRET=local-dev-session-secret-change-in-production
JWT_EXPIRES_IN=7d

# Local Redis
REDIS_URL=redis://127.0.0.1:6379

# Email disabled locally by default
EMAIL_ENABLED=false
REQUIRE_EMAIL_VERIFICATION=false

# Logging
LOG_LEVEL=debug
`

  fs.writeFileSync(envPath, content, 'utf8')
  write('✓ Created backend/.env.local')
}

function ensureFrontendEnv() {
  const feDir = path.join(__dirname, '..', 'frontend')
  const envPath = path.join(feDir, '.env')
  if (fs.existsSync(envPath)) {
    write('✓ frontend/.env already exists (skipping)')
    return
  }
  const content = `# Frontend Environment (local dev)
VITE_API_URL=http://localhost:5001/api
VITE_SOCKET_URL=http://localhost:5001
# Optional for CDN testing:
# VITE_ASSET_BASE_URL=
`
  fs.writeFileSync(envPath, content, 'utf8')
  write('✓ Created frontend/.env')
}

function ensureGitignore() {
  const giPath = path.join(__dirname, '..', '.gitignore')
  if (!fs.existsSync(giPath)) return
  const text = fs.readFileSync(giPath, 'utf8')
  let updated = false
  if (!/\.env\.local/m.test(text)) {
    fs.appendFileSync(giPath, '\n# Local environment files\n.env.local\n*.env.local\n')
    updated = true
  }
  if (updated) write('✓ Updated .gitignore to ignore .env.local files')
}

;(function main() {
  write('Setting up local environment files...')
  ensureBackendEnvLocal()
  ensureFrontendEnv()
  ensureGitignore()
  write('\nDone. Next steps:')
  write('  • Ensure Postgres/Redis are running: npm run check:services')
  write('  • Apply migrations: cd backend && npm run migrate')
  write('  • Start dev: npm run dev:manual (or npm run dev on Windows)')
})()
