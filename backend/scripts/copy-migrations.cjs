// Copy migrations to dist/migrations after build (CJS to work in ESM package)
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('node:fs')
const path = require('node:path')

try {
  const distMigrations = path.join(__dirname, '..', 'dist-esm', 'migrations')
  if (!fs.existsSync(distMigrations)) {
    fs.mkdirSync(distMigrations, { recursive: true })
  }
  const srcMigrations = path.join(__dirname, '..', 'migrations')
  if (fs.existsSync(srcMigrations)) {
    fs.cpSync(srcMigrations, distMigrations, { recursive: true })
    console.log('✅ Copied migrations to dist/migrations')
  } else {
    console.error('❌ Warning: migrations directory not found')
  }
} catch (e) {
  console.error('❌ Failed to copy migrations:', e)
  process.exitCode = 0 // non-fatal
}
