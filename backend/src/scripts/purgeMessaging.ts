import dotenv from 'dotenv'

// Load environment variables before anything else
dotenv.config()

import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'

type TableName =
  | 'conversations'
  | 'conversation_messages'
  | 'conversation_members'
  | 'clan_chat_messages'
  | 'user_blocks'

async function tableExists(table: TableName): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::int AS count
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  )
  return Number(result.rows[0]?.count ?? 0) > 0
}

async function countRows(table: TableName): Promise<number> {
  const exists = await tableExists(table)
  if (!exists) return 0
  const result = await query<{ count: string }>(`SELECT COUNT(*)::bigint AS count FROM ${table}`)
  return Number(result.rows[0]?.count ?? 0)
}

async function purge({ includeUserBlocks }: { includeUserBlocks: boolean }): Promise<void> {
  const hasConversations = await tableExists('conversations')
  const hasClanChat = await tableExists('clan_chat_messages')
  const hasUserBlocks = includeUserBlocks && (await tableExists('user_blocks'))

  const tablesToTruncate: TableName[] = []
  if (hasConversations) tablesToTruncate.push('conversations') // cascades to conversation_* and receipts
  if (hasClanChat) tablesToTruncate.push('clan_chat_messages')
  if (hasUserBlocks) tablesToTruncate.push('user_blocks')

  if (tablesToTruncate.length === 0) {
    logger.warn('No messaging tables found to truncate')
    return
  }

  const sql = `TRUNCATE TABLE ${tablesToTruncate.join(', ')} RESTART IDENTITY CASCADE` as const
  logger.info('Executing purge:', { sql })
  await query(sql)
  logger.info('Purge complete')
}

function parseArgs() {
  const args = new Set(process.argv.slice(2))
  return {
    yes: args.has('--yes') || args.has('-y'),
    dryRun: args.has('--dry-run') || args.has('-n'),
    includeUserBlocks: args.has('--include-user-blocks'),
  }
}

async function main() {
  const { yes, dryRun, includeUserBlocks } = parseArgs()

  const before = {
    conversations: await countRows('conversations'),
    conversation_messages: await countRows('conversation_messages'),
    conversation_members: await countRows('conversation_members'),
    clan_chat_messages: await countRows('clan_chat_messages'),
    user_blocks: includeUserBlocks ? await countRows('user_blocks') : undefined,
  }

  logger.info('Current messaging row counts', before)

  if (dryRun || !yes) {
    logger.warn(
      'Dry run or confirmation missing. Pass --yes to execute, and optionally --include-user-blocks to wipe block lists.',
    )
    return
  }

  await purge({ includeUserBlocks })

  const after = {
    conversations: await countRows('conversations'),
    conversation_messages: await countRows('conversation_messages'),
    conversation_members: await countRows('conversation_members'),
    clan_chat_messages: await countRows('clan_chat_messages'),
    user_blocks: includeUserBlocks ? await countRows('user_blocks') : undefined,
  }
  logger.info('Post-purge messaging row counts', after)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('purgeMessaging failed', { error })
    process.exit(1)
  })
