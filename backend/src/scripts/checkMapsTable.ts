#!/usr/bin/env ts-node

import path from 'node:path'
import dotenv from 'dotenv'
import { Pool } from 'pg'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const writeOut = (message = '') => {
  process.stdout.write(`${message}\n`)
}

const writeErr = (message = '') => {
  process.stderr.write(`${message}\n`)
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:QZCDzahSSRUZLYUERywzrSMJvUWmgbor@yamanote.proxy.rlwy.net:46553/railway'

async function checkMapsTable() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    writeOut('Connecting to database...')

    // Check what columns exist in maps table
    const columnsQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'maps'
      ORDER BY ordinal_position;
    `

    const result = await pool.query(columnsQuery)

    writeOut('\n=== MAPS TABLE COLUMNS ===')
    writeOut(`Total columns: ${result.rows.length}`)
    writeOut('\nColumns:')
    result.rows.forEach((col) => {
      writeOut(
        `  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${
          col.column_default ? `DEFAULT ${col.column_default}` : ''
        }`,
      )
    })

    // Check specifically for the columns we need
    const expectedColumns = [
      'is_featured',
      'is_public',
      'rating_average',
      'rating_count',
      'play_count',
      'tags',
      'is_vip_only',
    ]
    const existingColumns = result.rows.map((r) => r.column_name)

    writeOut('\n=== COLUMN CHECK ===')
    expectedColumns.forEach((col) => {
      const exists = existingColumns.includes(col)
      writeOut(`  ${col}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`)
    })

    // Check a sample query to see what fails
    writeOut('\n=== TESTING QUERY ===')
    try {
      const testQuery = `SELECT id, name, is_featured FROM maps LIMIT 1`
      await pool.query(testQuery)
      writeOut('Query with is_featured: SUCCESS')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeErr(`Query with is_featured: FAILED - ${message}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeErr(`Error: ${message}`)
  } finally {
    await pool.end()
  }
}

checkMapsTable().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  writeErr(`Fatal error: ${message}`)
  process.exit(1)
})
