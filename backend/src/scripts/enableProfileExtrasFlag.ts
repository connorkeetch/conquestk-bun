import dotenv from 'dotenv'

dotenv.config()

import { query } from '../config/database'
import { logger } from '../utils/logger'

async function main() {
  try {
    const res = await query<{ updated: number }>(
      `UPDATE feature_flags 
       SET is_enabled = TRUE, access_level = 'public', updated_at = NOW()
       WHERE flag_name = 'ui_profile_extras'
       RETURNING 1 AS updated`,
    )
    logger.info(`ui_profile_extras enabled (rows=${res.rowCount ?? 0})`)
    process.exit(0)
  } catch (e) {
    logger.error('Failed to enable ui_profile_extras', e)
    process.exit(1)
  }
}

main()
