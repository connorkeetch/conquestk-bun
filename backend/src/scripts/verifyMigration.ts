import dotenv from 'dotenv'
import { Pool } from 'pg'

// Load environment variables
dotenv.config()

async function verifyMigration() {
  // Use command line argument or environment variable
  const databaseUrl = process.argv[2] || process.env.DATABASE_URL

  if (!databaseUrl || databaseUrl === '${DATABASE_URL}') {
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : false,
  })

  try {
    const tableQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'map_usage_stats', 'map_ratings', 'map_comments', 
        'map_downloads', 'map_favorites', 'map_tags', 'map_tag_associations'
      )
      ORDER BY table_name;
    `

    const tableResult = await pool.query(tableQuery)
    const expectedTables = [
      'map_comments',
      'map_downloads',
      'map_favorites',
      'map_ratings',
      'map_tag_associations',
      'map_tags',
      'map_usage_stats',
    ]

    expectedTables.forEach((table) => {
      const _found = tableResult.rows.some((row) => row.table_name === table)
    })
    const userColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN (
        'skill_rating', 'email_verified', 'email_verification_token',
        'email_verification_expires', 'password_reset_token', 'password_reset_expires',
        'skill_deviation', 'games_played', 'games_won', 'peak_rating',
        'current_tier', 'last_ranked_game_at', 'deleted_at', 'deleted_by', 'deletion_reason'
      )
      ORDER BY column_name;
    `

    const userColumnResult = await pool.query(userColumnQuery)
    const expectedUserColumns = [
      'skill_rating',
      'email_verified',
      'email_verification_token',
      'email_verification_expires',
      'password_reset_token',
      'password_reset_expires',
      'skill_deviation',
      'games_played',
      'games_won',
      'peak_rating',
      'current_tier',
      'last_ranked_game_at',
      'deleted_at',
      'deleted_by',
      'deletion_reason',
    ]

    expectedUserColumns.forEach((column) => {
      const _found = userColumnResult.rows.some((row) => row.column_name === column)
    })
    const mapColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'maps' 
      AND column_name IN (
        'download_count', 'play_count', 'rating_average',
        'rating_count', 'featured', 'featured_at'
      )
      ORDER BY column_name;
    `

    const mapColumnResult = await pool.query(mapColumnQuery)
    const expectedMapColumns = [
      'download_count',
      'play_count',
      'rating_average',
      'rating_count',
      'featured',
      'featured_at',
    ]

    expectedMapColumns.forEach((column) => {
      const _found = mapColumnResult.rows.some((row) => row.column_name === column)
    })
    const tagQuery = `
      SELECT name FROM map_tags ORDER BY name;
    `

    const tagResult = await pool.query(tagQuery)
    if (tagResult.rows.length > 0) {
      tagResult.rows.forEach((_row) => {})
    } else {
    }

    // Summary
    const allTablesExist = expectedTables.every((table) =>
      tableResult.rows.some((row) => row.table_name === table),
    )
    const allUserColumnsExist = expectedUserColumns.every((column) =>
      userColumnResult.rows.some((row) => row.column_name === column),
    )
    const allMapColumnsExist = expectedMapColumns.every((column) =>
      mapColumnResult.rows.some((row) => row.column_name === column),
    )
    if (allTablesExist && allUserColumnsExist && allMapColumnsExist) {
    } else {
    }
  } catch (_error) {
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run verification
verifyMigration().catch(console.error)
