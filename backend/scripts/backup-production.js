#!/usr/bin/env node

/**
 * Production Database Backup Script
 * Creates a backup of current production data before running consolidated migration
 */

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const writeOut = (message = '') => {
  process.stdout.write(`${message}\n`)
}

const writeErr = (message = '') => {
  process.stderr.write(`${message}\n`)
}

// Get DATABASE_URL from environment or prompt
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  writeErr('ERROR: DATABASE_URL environment variable is required')
  process.exit(1)
}

// Create backup directory
const backupDir = path.join(__dirname, '../backups')
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupFile = path.join(backupDir, `production-backup-${timestamp}.sql`)

writeOut('🔄 Starting production database backup...')
writeOut(`📁 Backup location: ${backupFile}`)

try {
  // Backup essential user data only (since user said minimal data aside from theirs)
  const backupQuery = `
    -- Backup essential user data
    SELECT 'INSERT INTO users (id, username, email, password, email_verified, skill_rating, games_played, games_won, peak_rating, last_login, is_admin, created_at, updated_at) VALUES (' ||
           quote_literal(id::text) || ', ' ||
           quote_literal(username) || ', ' ||
           quote_literal(email) || ', ' ||
           quote_literal(password) || ', ' ||
           email_verified || ', ' ||
           skill_rating || ', ' ||
           games_played || ', ' ||
           games_won || ', ' ||
           peak_rating || ', ' ||
           COALESCE('''' || last_login || '''', 'NULL') || ', ' ||
           is_admin || ', ' ||
           '''' || created_at || '''' || ', ' ||
           '''' || updated_at || '''' || ');'
    FROM users WHERE deleted_at IS NULL;
    
    -- Backup user settings if they exist
    SELECT 'INSERT INTO user_settings (id, user_id, theme, preferred_color, show_online_status, direct_messages, notifications, created_at, updated_at) VALUES (' ||
           quote_literal(id::text) || ', ' ||
           quote_literal(user_id::text) || ', ' ||
           quote_literal(theme) || ', ' ||
           quote_literal(preferred_color) || ', ' ||
           show_online_status || ', ' ||
           quote_literal(direct_messages) || ', ' ||
           quote_literal(notifications::text) || ', ' ||
           '''' || created_at || '''' || ', ' ||
           '''' || updated_at || '''' || ');'
    FROM user_settings 
    WHERE EXISTS (SELECT 1 FROM users WHERE users.id = user_settings.user_id AND users.deleted_at IS NULL);
  `

  // Execute backup using psql
  const command = `psql "${DATABASE_URL}" -t -c "${backupQuery.replace(/\n\s+/g, ' ')}" > "${backupFile}"`

  execSync(command, { stdio: 'inherit' })

  writeOut('✅ Backup completed successfully!')
  writeOut(`📄 Backup file: ${backupFile}`)

  // Verify backup file exists and has content
  if (fs.existsSync(backupFile)) {
    const stats = fs.statSync(backupFile)
    writeOut(`📊 Backup size: ${stats.size} bytes`)

    if (stats.size === 0) {
      writeErr('⚠️  Warning: Backup file is empty - this may be expected if no user data exists')
    }
  }

  writeOut('\n🚀 Ready to deploy consolidated migration!')
  writeOut('💡 To restore from backup if needed:')
  writeOut(`   psql "\\$DATABASE_URL" < "${backupFile}"`)
} catch (error) {
  writeErr(`❌ Backup failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
