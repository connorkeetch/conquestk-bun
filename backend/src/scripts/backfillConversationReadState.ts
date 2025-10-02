import { query } from '../config/database'
import { logger } from '../utils/logger'

interface ConversationReadRow {
  id: string
  conversation_id: string
  user_id: string
  last_message_id: string
  last_message_created_at: Date
  last_read_message_id: string | null
  last_read_at: Date | null
}

const DRY_RUN = process.argv.includes('--dry-run')

async function fetchRowsNeedingUpdate(): Promise<ConversationReadRow[]> {
  const result = await query<ConversationReadRow>(
    `
    SELECT
      cm.id,
      cm.conversation_id,
      cm.user_id,
      cm.last_read_message_id,
      cm.last_read_at,
      last_msg.id AS last_message_id,
      last_msg.created_at AS last_message_created_at
    FROM conversation_members cm
    JOIN LATERAL (
      SELECT id, created_at
      FROM conversation_messages m
      WHERE m.conversation_id = cm.conversation_id
      ORDER BY created_at DESC
      LIMIT 1
    ) last_msg ON TRUE
    WHERE last_msg.id IS NOT NULL
      AND (cm.last_read_message_id IS NULL OR cm.last_read_at IS NULL)
  `,
  )

  return result.rows
}

async function run(): Promise<void> {
  logger.info('Starting conversation read-state backfill', { dryRun: DRY_RUN })

  const rows = await fetchRowsNeedingUpdate()
  if (rows.length === 0) {
    logger.info('No conversation members require backfill')
    return
  }

  if (DRY_RUN) {
    logger.info('Dry run complete', { rowsNeedingUpdate: rows.length })
    return
  }

  const updateResult = await query(
    `
    UPDATE conversation_members cm
    SET
      last_read_message_id = src.last_message_id,
      last_read_at = src.last_message_created_at,
      updated_at = NOW()
    FROM (
      SELECT
        cm.id,
        last_msg.id AS last_message_id,
        last_msg.created_at AS last_message_created_at
      FROM conversation_members cm
      JOIN LATERAL (
        SELECT id, created_at
        FROM conversation_messages m
        WHERE m.conversation_id = cm.conversation_id
        ORDER BY created_at DESC
        LIMIT 1
      ) last_msg ON TRUE
      WHERE (cm.last_read_message_id IS NULL OR cm.last_read_at IS NULL)
    ) src
    WHERE cm.id = src.id
  `,
  )

  logger.info('Conversation read-state backfill complete', {
    rowsEvaluated: rows.length,
    rowsUpdated: updateResult.rowCount ?? rows.length,
  })
}

run()
  .then(() => {
    logger.info('Backfill finished successfully')
    process.exit(0)
  })
  .catch((error) => {
    logger.error('Backfill failed', { error })
    process.exit(1)
  })
