import readline from 'node:readline'
import { getRedisClient, initializeRedis } from '../config/redis'
import { logger } from '../utils/logger'

async function promptConfirm(message: string): Promise<boolean> {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer: string = await new Promise((resolve) =>
    rl.question(`${message} (yes/no): `, (ans) => resolve(ans.trim().toLowerCase())),
  )
  rl.close()
  return answer === 'y' || answer === 'yes'
}

function parsePrefixes(): string[] {
  const idx = process.argv.indexOf('--prefixes')
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
  }
  // Default game-related prefixes
  return ['game:state:', 'territory_modifiers:game:', 'room:treasure-config:', 'lock:game:ready:']
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const prefixes = parsePrefixes()
  // Ensure Redis is initialized for standalone script usage
  await initializeRedis()
  const redis = getRedisClient()

  if (!redis) {
    logger.warn('Redis client not configured; nothing to clean')
    return
  }

  logger.warn(`Wipe Redis (game-related) starting${dryRun ? ' (dry-run)' : ''}`)
  logger.info(`Prefixes: ${prefixes.join(', ')}`)

  // Collect keys per prefix
  const plan: Array<{ prefix: string; keys: string[] }> = []
  for (const prefix of prefixes) {
    const keys = await redis.keys(`${prefix}*`)
    plan.push({ prefix, keys })
  }

  const total = plan.reduce((sum, p) => sum + p.keys.length, 0)
  logger.info(`Found ${total} key(s) across ${plan.length} prefix(es)`)

  if (dryRun) {
    for (const p of plan) {
      logger.info(`- ${p.prefix}* : ${p.keys.length}`)
    }
    return
  }

  if (!(await promptConfirm('This will delete the keys listed above. Proceed?'))) {
    logger.info('Aborted by user')
    return
  }

  // Delete in batches
  let deleted = 0
  for (const p of plan) {
    if (p.keys.length > 0) {
      await redis.del(...p.keys)
      deleted += p.keys.length
    }
  }

  logger.info(`Deleted ${deleted} key(s) from Redis.`)
}

main().catch((e) => {
  logger.error('Fatal error in wipeRedisGames script', e)
  process.exit(1)
})
