#!/usr/bin/env node
/*
  Checks local Postgres and Redis availability using backend/.env(.local).
  With --start, attempts to start services via Docker Compose when available.
*/

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function loadBackendEnv() {
  const dotenv = require('dotenv')
  const backendDir = path.join(__dirname, '..', 'backend')
  const localPath = path.join(backendDir, '.env.local')
  const envPath = fs.existsSync(localPath) ? localPath : path.join(backendDir, '.env')
  dotenv.config({ path: envPath })
  return { backendDir, envPath }
}

async function checkPostgres(databaseUrl) {
  if (!databaseUrl) return { ok: false, error: 'DATABASE_URL not set' }
  try {
    const { Client } = require('pg')
    const client = new Client({ connectionString: databaseUrl, ssl: false })
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))
    const run = (async () => {
      await client.connect()
      await client.query('SELECT 1')
      await client.end()
      return true
    })()
    await Promise.race([run, timeout])
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message ? e.message : String(e) }
  }
}

async function checkRedis(redisUrl) {
  if (!redisUrl) return { ok: false, error: 'REDIS_URL not set' }
  try {
    let Redis
    try {
      Redis = require('ioredis')
    } catch (_e) {
      // Fallback to redis-cli if ioredis not resolvable in this workspace
      const ping = spawnSync('redis-cli', ['-u', redisUrl, 'PING'], {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 2000,
      })
      const ok = ping.status === 0 && /PONG/.test(ping.stdout)
      return ok
        ? { ok: true }
        : { ok: false, error: ping.stderr || ping.stdout || 'redis-cli failed' }
    }
    const client = new Redis(redisUrl, { lazyConnect: true })
    await client.connect()
    const res = await client.ping()
    await client.quit()
    return { ok: res === 'PONG' }
  } catch (e) {
    return { ok: false, error: e?.message ? e.message : String(e) }
  }
}

function hasDockerCompose() {
  const dc = spawnSync('docker-compose', ['version'], { stdio: 'ignore' })
  if (dc.status === 0) return 'docker-compose'
  const dc2 = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' })
  if (dc2.status === 0) return 'docker compose'
  return null
}

function startWithCompose(services = []) {
  const tool = hasDockerCompose()
  if (!tool) return { ok: false, error: 'Docker Compose not found' }
  const args =
    tool === 'docker-compose' ? ['up', '-d', ...services] : ['compose', 'up', '-d', ...services]
  const p = spawnSync(tool.split(' ')[0], args, { stdio: 'inherit' })
  return { ok: p.status === 0 }
}

;(async function main() {
  const { envPath } = loadBackendEnv()
  const start = process.argv.includes('--start')
  const dbUrl = process.env.DATABASE_URL
  const redisUrl = process.env.REDIS_URL

  process.stdout.write(`Using env: ${envPath}\n`)

  const [pgStatus, redisStatus] = await Promise.all([checkPostgres(dbUrl), checkRedis(redisUrl)])

  process.stdout.write('\n— Service Status —\n')
  process.stdout.write(
    `Postgres: ${pgStatus.ok ? 'UP' : 'DOWN'}${pgStatus.error ? ` (${pgStatus.error})` : ''}\n`,
  )
  process.stdout.write(
    `Redis:    ${redisStatus.ok ? 'UP' : 'DOWN'}${redisStatus.error ? ` (${redisStatus.error})` : ''}\n`,
  )

  if (!start) {
    if (!pgStatus.ok) {
      process.stdout.write('\nTo start Postgres:\n')
      process.stdout.write(
        '  • Docker Compose:  docker-compose up -d postgres  (or: docker compose up -d postgres)\n',
      )
      process.stdout.write('  • Linux systemd:   sudo systemctl enable --now postgresql\n')
    }
    if (!redisStatus.ok) {
      process.stdout.write('\nTo start Redis:\n')
      process.stdout.write(
        '  • Docker Compose:  docker-compose up -d redis     (or: docker compose up -d redis)\n',
      )
      process.stdout.write('  • Linux systemd:   sudo systemctl enable --now redis-server\n')
    }
    process.exit(pgStatus.ok && redisStatus.ok ? 0 : 1)
  }

  // Opportunistic start via Docker Compose
  const need = []
  if (!pgStatus.ok) need.push('postgres')
  if (!redisStatus.ok) need.push('redis')

  if (need.length === 0) {
    process.stdout.write('\nAll services running; nothing to start.\n')
    process.exit(0)
  }

  if (!fs.existsSync(path.join(process.cwd(), 'docker-compose.yml'))) {
    process.stderr.write(
      '\nNo docker-compose.yml found at project root; cannot auto-start. See commands above to start manually.\n',
    )
    process.exit(1)
  }

  process.stdout.write(`\nAttempting to start via Docker Compose: ${need.join(', ')}\n`)
  const result = startWithCompose(need)
  if (!result.ok) process.exit(1)

  // Re-check after start
  const [pg2, r2] = await Promise.all([checkPostgres(dbUrl), checkRedis(redisUrl)])
  process.stdout.write('\n— Service Status (after start) —\n')
  process.stdout.write(`Postgres: ${pg2.ok ? 'UP' : 'DOWN'}\n`)
  process.stdout.write(`Redis:    ${r2.ok ? 'UP' : 'DOWN'}\n`)
  process.exit(pg2.ok && r2.ok ? 0 : 1)
})().catch((e) => {
  process.stderr.write(`${e?.message || e}\n`)
  process.exit(1)
})
