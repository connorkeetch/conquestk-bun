#!/usr/bin/env node

/**
 * One-time script to ensure owner has admin privileges
 * Run with: npx ts-node src/scripts/makeOwnerAdmin.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { getPool } from '../config/database'
import { logger } from '../utils/logger'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') })

const OWNER_EMAILS = [
  'connorkeetch@gmail.com',  // Primary email
  'Keetch'  // Username
]

async function makeOwnerAdmin() {
  const pool = getPool()
  
  try {
    console.log('🔍 Looking for owner account...')
    
    // Find user by email or username
    const userResult = await pool.query(
      `SELECT id, username, email, is_admin 
       FROM users 
       WHERE LOWER(email) = ANY($1::text[]) 
          OR LOWER(username) = ANY($1::text[])`,
      [OWNER_EMAILS.map(e => e.toLowerCase())]
    )
    
    if (userResult.rows.length === 0) {
      console.log('❌ Owner account not found. Please register with connorkeetch@gmail.com first.')
      process.exit(1)
    }
    
    const user = userResult.rows[0]
    console.log(`✅ Found user: ${user.username} (${user.email})`)
    
    // Update to admin
    await pool.query(
      `UPDATE users 
       SET is_admin = true, 
           admin_since = COALESCE(admin_since, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id]
    )
    console.log('✅ User marked as admin')
    
    // Check if super_admin role exists
    const roleResult = await pool.query(
      `SELECT id FROM admin_roles WHERE name = 'super_admin'`
    )
    
    if (roleResult.rows.length > 0) {
      const roleId = roleResult.rows[0].id
      
      // Assign super_admin role
      await pool.query(
        `INSERT INTO user_admin_roles (user_id, role_id, assigned_by, assigned_at)
         VALUES ($1, $2, $1, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, role_id) 
         DO UPDATE SET 
           is_active = true,
           assigned_at = CURRENT_TIMESTAMP`,
        [user.id, roleId]
      )
      console.log('✅ Super admin role assigned')
    } else {
      console.log('⚠️  Super admin role not found in database (migrations may need to run)')
    }
    
    // Log the action
    await pool.query(
      `INSERT INTO admin_activity_logs (
        admin_user_id, 
        action_type, 
        action_details,
        timestamp
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [
        user.id,
        'owner_admin_setup',
        JSON.stringify({
          email: user.email,
          username: user.username,
          script: 'makeOwnerAdmin.ts'
        })
      ]
    )
    console.log('✅ Activity logged')
    
    console.log('\n🎉 SUCCESS! You are now an admin.')
    console.log('📌 Login and visit /admin to access the admin dashboard')
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Error setting up admin:', error)
    process.exit(1)
  }
}

// Run the script
makeOwnerAdmin().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})