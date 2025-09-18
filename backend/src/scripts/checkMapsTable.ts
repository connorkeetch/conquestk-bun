#!/usr/bin/env ts-node

import dotenv from 'dotenv'
import path from 'path'
import { Pool } from 'pg'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:QZCDzahSSRUZLYUERywzrSMJvUWmgbor@yamanote.proxy.rlwy.net:46553/railway'

async function checkMapsTable() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    console.log('Connecting to database...')

    // Check what columns exist in maps table
    const columnsQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'maps'
      ORDER BY ordinal_position;
    `

    const result = await pool.query(columnsQuery)

    console.log('\n=== MAPS TABLE COLUMNS ===')
    console.log('Total columns:', result.rows.length)
    console.log('\nColumns:')
    result.rows.forEach((col) => {
      console.log(
        `  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`,
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

    console.log('\n=== COLUMN CHECK ===')
    expectedColumns.forEach((col) => {
      const exists = existingColumns.includes(col)
      console.log(`  ${col}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`)
    })

    // Check a sample query to see what fails
    console.log('\n=== TESTING QUERY ===')
    try {
      const testQuery = `SELECT id, name, is_featured FROM maps LIMIT 1`
      await pool.query(testQuery)
      console.log('Query with is_featured: SUCCESS')
    } catch (err: any) {
      console.log('Query with is_featured: FAILED -', err.message)
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

checkMapsTable().catch(console.error)
