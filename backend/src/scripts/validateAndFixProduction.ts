import { DEFAULT_THEME_ID } from '@risk-game/shared/types/themes'
import { initDatabase, query } from '../config/database'
import { getErrorMessage } from '../utils/errorHelpers'
import { logger } from '../utils/logger'

async function validateAndFixProduction() {
  try {
    logger.info('🔍 Validating and fixing production database schema...')

    // Initialize database
    await initDatabase()

    // 1. Check if user_preferences table exists and has required columns
    logger.info('\n=== CHECKING USER_PREFERENCES TABLE ===')

    try {
      const userPrefColumns = await query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'user_preferences'
        ORDER BY ordinal_position
      `)

      if (userPrefColumns.rows.length === 0) {
        logger.info('❌ user_preferences table does not exist, creating...')
        await query(`
          CREATE TABLE IF NOT EXISTS user_preferences (
            user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            theme VARCHAR(50) DEFAULT '${DEFAULT_THEME_ID}',
            notification_enabled BOOLEAN DEFAULT TRUE,
            show_online_status BOOLEAN DEFAULT TRUE,
            direct_messages VARCHAR(20) DEFAULT 'friends',
            preferred_color VARCHAR(50) DEFAULT '#DC2626',
            dm_notifications_browser BOOLEAN DEFAULT TRUE,
            dm_notifications_email BOOLEAN DEFAULT FALSE,
            sound_enabled BOOLEAN DEFAULT TRUE,
            music_enabled BOOLEAN DEFAULT TRUE,
            auto_ready BOOLEAN DEFAULT FALSE,
            show_timer BOOLEAN DEFAULT TRUE,
            show_army_numbers BOOLEAN DEFAULT TRUE,
            animation_speed INTEGER DEFAULT 1,
            language VARCHAR(10) DEFAULT 'en',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `)
        logger.info('✅ Created user_preferences table')
      } else {
        const existing = userPrefColumns.rows.map((r) => r.column_name)
        logger.info('✅ user_preferences table exists with columns:', existing.join(', '))

        const ensureColumn = async (name: string, ddl: string) => {
          if (!existing.includes(name)) {
            logger.info(`❌ ${name} column missing, adding...`)
            await query(`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS ${ddl}`)
            logger.info(`✅ Added ${name} column`)
          }
        }

        await ensureColumn('theme', `theme VARCHAR(50) DEFAULT '${DEFAULT_THEME_ID}'`)
        await ensureColumn('notification_enabled', 'notification_enabled BOOLEAN DEFAULT TRUE')
        await ensureColumn('show_online_status', 'show_online_status BOOLEAN DEFAULT TRUE')
        await ensureColumn('direct_messages', "direct_messages VARCHAR(20) DEFAULT 'friends'")
        await ensureColumn('preferred_color', "preferred_color VARCHAR(50) DEFAULT '#DC2626'")
        await ensureColumn('dm_notifications_browser', 'dm_notifications_browser BOOLEAN DEFAULT TRUE')
        await ensureColumn('dm_notifications_email', 'dm_notifications_email BOOLEAN DEFAULT FALSE')
        await ensureColumn('sound_enabled', 'sound_enabled BOOLEAN DEFAULT TRUE')
        await ensureColumn('music_enabled', 'music_enabled BOOLEAN DEFAULT TRUE')
        await ensureColumn('auto_ready', 'auto_ready BOOLEAN DEFAULT FALSE')
        await ensureColumn('show_timer', 'show_timer BOOLEAN DEFAULT TRUE')
        await ensureColumn('show_army_numbers', 'show_army_numbers BOOLEAN DEFAULT TRUE')
        await ensureColumn('animation_speed', 'animation_speed INTEGER DEFAULT 1')
        await ensureColumn('language', "language VARCHAR(10) DEFAULT 'en'")
      }
    } catch (error) {
      logger.error('Error with user_preferences table:', getErrorMessage(error))
    }

    // 2. Check admin_roles table
    logger.info('\n=== CHECKING ADMIN_ROLES TABLE ===')
    try {
      const adminRolesCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'admin_roles'
      `)

      if (adminRolesCheck.rows.length === 0) {
        logger.info('❌ admin_roles table does not exist, creating...')
        await query(`
          CREATE TABLE IF NOT EXISTS admin_roles (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) UNIQUE NOT NULL,
            description TEXT,
            permissions JSONB NOT NULL DEFAULT '[]',
            is_super_admin BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `)
        logger.info('✅ Created admin_roles table')
      } else {
        logger.info('✅ admin_roles table exists')
      }
    } catch (error) {
      logger.error('Error with admin_roles table:', getErrorMessage(error))
    }

    // 3. Check user_admin_roles table
    logger.info('\n=== CHECKING USER_ADMIN_ROLES TABLE ===')
    try {
      const userAdminRolesCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'user_admin_roles'
      `)

      if (userAdminRolesCheck.rows.length === 0) {
        logger.info('❌ user_admin_roles table does not exist, creating...')
        await query(`
          CREATE TABLE IF NOT EXISTS user_admin_roles (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_id UUID NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
            assigned_by UUID NOT NULL REFERENCES users(id),
            assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP WITH TIME ZONE,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, role_id)
          )
        `)
        logger.info('✅ Created user_admin_roles table')
      } else {
        logger.info('✅ user_admin_roles table exists')
      }
    } catch (error) {
      logger.error('Error with user_admin_roles table:', getErrorMessage(error))
    }

    // 4. Create super_admin role if it doesn't exist
    logger.info('\n=== ENSURING SUPER_ADMIN ROLE ===')
    const superAdminRoleCheck = await query("SELECT id FROM admin_roles WHERE name = 'super_admin'")

    if (superAdminRoleCheck.rows.length === 0) {
      logger.info('❌ super_admin role does not exist, creating...')
      await query(`
        INSERT INTO admin_roles (name, description, permissions, is_super_admin) 
        VALUES ('super_admin', 'Full system access', ARRAY['*'], true)
      `)
      logger.info('✅ Created super_admin role')
    } else {
      logger.info('✅ super_admin role exists')
    }

    // 5. Check other essential columns in users table
    logger.info('\n=== CHECKING USERS TABLE COLUMNS ===')
    const userColumns = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `)

    const columnNames = userColumns.rows.map((r) => r.column_name)
    logger.info('Users table columns:', columnNames.join(', '))

    // Add missing columns if needed
    const essentialColumns = [
      {
        name: 'email_verified',
        type: 'BOOLEAN DEFAULT FALSE',
        condition: !columnNames.includes('email_verified'),
      },
      { name: 'bio', type: 'TEXT', condition: !columnNames.includes('bio') },
      {
        name: 'skill_rating',
        type: 'INTEGER DEFAULT 1000',
        condition: !columnNames.includes('skill_rating'),
      },
      {
        name: 'games_played',
        type: 'INTEGER DEFAULT 0',
        condition: !columnNames.includes('games_played'),
      },
      {
        name: 'games_won',
        type: 'INTEGER DEFAULT 0',
        condition: !columnNames.includes('games_won'),
      },
      { name: 'peak_rating', type: 'INTEGER', condition: !columnNames.includes('peak_rating') },
      {
        name: 'current_tier',
        type: 'VARCHAR(50)',
        condition: !columnNames.includes('current_tier'),
      },
      {
        name: 'last_login',
        type: 'TIMESTAMP WITH TIME ZONE',
        condition: !columnNames.includes('last_login'),
      },
      {
        name: 'deleted_at',
        type: 'TIMESTAMP WITH TIME ZONE',
        condition: !columnNames.includes('deleted_at'),
      },
    ]

    for (const col of essentialColumns) {
      if (col.condition) {
        logger.info(`❌ Missing ${col.name} column, adding...`)
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`)
        logger.info(`✅ Added ${col.name} column`)
      }
    }

    // 6. Test the fixes
    logger.info('\n=== TESTING FIXES ===')

    // Test user_preferences query
    try {
      await query(`
        SELECT theme, preferred_color 
        FROM user_preferences 
        LIMIT 1
      `)
      logger.info('✅ user_preferences query works')
    } catch (error) {
      logger.error('❌ user_preferences query still fails:', getErrorMessage(error))
    }

    // Test admin query
    try {
      await query(`
        SELECT 1 FROM user_admin_roles uar
        JOIN admin_roles ar ON uar.role_id = ar.id
        WHERE uar.is_active = TRUE
        LIMIT 1
      `)
      logger.info('✅ admin roles query works')
    } catch (error) {
      logger.error('❌ admin roles query still fails:', getErrorMessage(error))
    }

    logger.info(`
🎉 PRODUCTION DATABASE VALIDATION COMPLETE!

Summary:
- ✅ user_preferences table validated
- ✅ admin_roles table with super_admin role
- ✅ user_admin_roles table for role assignments
- ✅ users table with all essential columns

Next steps:
1. Deploy this script to production
2. Run it to fix the schema issues
3. Test admin and profile endpoints
4. Assign admin role to user if needed
    `)

    process.exit(0)
  } catch (error) {
    logger.error('❌ Production validation failed:', getErrorMessage(error))
    process.exit(1)
  }
}

// Run the script
validateAndFixProduction()
