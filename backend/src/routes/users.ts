import bcrypt from 'bcryptjs'
import { type Request, type Response, Router } from 'express'
import { query } from '../config/database'
import { PREMIUM_COLOR_KEYS } from '../constants/premium'
import { authenticateToken } from '../middleware/auth'
import { profileService } from '../services/profileService'
import { logger } from '../utils/logger'
import { handleRouteError } from '../utils/routeErrorHandler'

const router = Router()

let ensuredUserProfileColumns = false
const ensureUserProfileColumns = async () => {
  if (ensuredUserProfileColumns) return

  try {
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT')
    await query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS tagline TEXT DEFAULT 'Commander of the Conquest Realms'",
    )
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP')
    ensuredUserProfileColumns = true
  } catch (error) {
    logger.warn('Failed to ensure required user columns exist:', error)
  }
}

const PLAYER_COLOR_DEFAULT = '#DC2626'

const LEGACY_COLOR_MAP: Record<string, string> = {
  red: '#DC2626',
  'bright-red': '#DC2626',
  crimson: '#851D2D',
  orange: '#EA580C',
  amber: '#F59E0B',
  yellow: '#F59E0B',
  green: '#059669',
  emerald: '#059669',
  forest: '#014421',
  blue: '#2563EB',
  cyan: '#06B6D4',
  teal: '#06B6D4',
  pink: '#EC4899',
  violet: '#7C3AED',
  purple: '#7C3AED',
  brown: '#7C2D12',
  tan: '#918151',
  lime: '#918151',
  indigo: '#7C3AED',
}

const HEX_NORMALIZATION_MAP: Record<string, string> = {
  '#dc2626': '#DC2626',
  '#851d2d': '#851D2D',
  '#ec4899': '#EC4899',
  '#ea580c': '#EA580C',
  '#f59e0b': '#F59E0B',
  '#014421': '#014421',
  '#059669': '#059669',
  '#2563eb': '#2563EB',
  '#06b6d4': '#06B6D4',
  '#7c3aed': '#7C3AED',
  '#918151': '#918151',
  '#7c2d12': '#7C2D12',
}

const normalizePreferredColor = (color?: string | null): string => {
  if (!color) {
    return PLAYER_COLOR_DEFAULT
  }

  const trimmed = color.trim()

  if (PREMIUM_COLOR_KEYS.has(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('linear-gradient(')) {
    return trimmed
  }

  if (trimmed.startsWith('#')) {
    return HEX_NORMALIZATION_MAP[trimmed.toLowerCase()] ?? trimmed.toUpperCase()
  }

  const normalized = LEGACY_COLOR_MAP[trimmed.toLowerCase()]
  if (normalized) {
    return normalized
  }

  return PLAYER_COLOR_DEFAULT
}

// The Conqueror's Path - Conquest rank system (mirrors frontend constants)
const CONQUEST_RANKS = [
  { name: 'Chieftain', minRating: 0, color: '#9CA3AF', insignia: '🛡️' },
  { name: 'Warlord', minRating: 800, color: '#92400E', insignia: '⚔️' },
  { name: 'Raider King', minRating: 1000, color: '#B22222', insignia: '⚓' },
  { name: 'Sultan', minRating: 1200, color: '#10B981', insignia: '☪️' },
  { name: 'Caesar', minRating: 1400, color: '#C0C0C0', insignia: '🦅' },
  { name: 'Khan', minRating: 1600, color: '#9B111E', insignia: '🏹' },
  { name: 'Emperor', minRating: 1800, color: '#2563EB', insignia: '👑' },
  { name: 'The Great King', minRating: 2000, color: '#FFD700', insignia: '☀️' },
  { name: 'Overlord', minRating: 2200, color: '#000000', insignia: '💀' },
  {
    name: 'Worldbreaker',
    minRating: 2400,
    color: 'linear-gradient(90deg, #EF4444, #F59E0B)',
    insignia: '☄️',
  },
]

// Helper function to calculate conquest rank
function getConquestRank(skillRating: number) {
  for (let i = CONQUEST_RANKS.length - 1; i >= 0; i--) {
    if (skillRating >= CONQUEST_RANKS[i].minRating) {
      return CONQUEST_RANKS[i]
    }
  }
  return CONQUEST_RANKS[0] // Default to Chieftain
}

router.get('/:username/history', async (req: Request, res: Response) => {
  const { username } = req.params
  const rawLimit = parseInt(req.query.limit as string, 10)
  const rawOffset = parseInt(req.query.offset as string, 10)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0

  try {
    const userResult = await query(
      `
      SELECT id
      FROM users
      WHERE username = $1 AND deleted_at IS NULL
    `,
      [username],
    )

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const userId = userResult.rows[0].id as string
    const matches = await profileService.getGameHistory(userId, limit, offset)

    return res.json({
      matches,
      pagination: {
        limit,
        offset,
        returned: matches.length,
        hasMore: matches.length === limit,
      },
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch match history', 500, { username })
    return res.status(500).json({ error: 'Failed to fetch match history' })
  }
})

// Get user profile by username (public route)
router.get('/:username/profile', async (req: Request, res: Response) => {
  const { username } = req.params
  try {
    await ensureUserProfileColumns()

    const result = await query(
      `
      SELECT
        u.id, u.username, u.email, u.created_at, u.email_verified, u.bio, u.tagline,
        u.skill_rating,
        COALESCE(ps.games_played, 0) AS games_played,
        COALESCE(ps.games_won, 0) AS games_won,
        COALESCE(ps.games_lost, 0) AS games_lost,
        u.skill_rating AS peak_rating,
        'bronze'::text AS current_tier,
        u.last_login,
        up.preferred_color
      FROM users u
      LEFT JOIN user_preferences up ON u.id = up.user_id
      LEFT JOIN player_stats ps ON ps.user_id = u.id
      WHERE u.username = $1 AND u.deleted_at IS NULL
    `,
      [username],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]
    const elo = user.skill_rating || 1000
    const rank = getConquestRank(elo)
    const nextRank =
      CONQUEST_RANKS.find((candidate) => candidate.minRating > rank.minRating) ?? null
    const gamesPlayed = user.games_played || 0
    const wins = user.games_won || 0
    const recordedLosses: number | null = user.games_lost ?? null
    const losses = recordedLosses !== null ? recordedLosses : Math.max(0, gamesPlayed - wins)
    const winRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0
    const preferredColor = normalizePreferredColor(user.preferred_color)

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email, // Only visible to own profile or admins
      emailVerified: user.email_verified,
      avatarUrl: null,
      bio: user.bio,
      tagline: user.tagline,
      elo,
      joinDate: user.created_at,
      lastActive: user.last_login,
      gamesPlayed,
      wins,
      losses,
      winRate,
      peakRating: user.peak_rating || elo,
      preferredColor,
      rank: {
        name: rank.name,
        color: rank.color,
        insignia: rank.insignia,
        rating: elo,
        minRating: rank.minRating,
        nextRank: nextRank
          ? {
              name: nextRank.name,
              minRating: nextRank.minRating,
            }
          : null,
      },
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch profile', 500, { username })
    return res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// Get own user profile (authenticated)
router.get('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId

    await ensureUserProfileColumns()

    const result = await query(
      `
      SELECT
        u.id, u.username, u.email, u.created_at, u.email_verified, u.bio, u.tagline,
        u.skill_rating,
        COALESCE(ps.games_played, 0) AS games_played,
        COALESCE(ps.games_won, 0) AS games_won,
        COALESCE(ps.games_lost, 0) AS games_lost,
        u.skill_rating AS peak_rating,
        'bronze'::text AS current_tier,
        u.last_login,
        up.preferred_color
      FROM users u
      LEFT JOIN user_preferences up ON u.id = up.user_id
      LEFT JOIN player_stats ps ON ps.user_id = u.id
      WHERE u.id = $1
    `,
      [userId],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]
    const elo = user.skill_rating || 1000
    const rank = getConquestRank(elo)
    const nextRank =
      CONQUEST_RANKS.find((candidate) => candidate.minRating > rank.minRating) ?? null
    const gamesPlayed = user.games_played || 0
    const wins = user.games_won || 0
    const recordedLosses: number | null = user.games_lost ?? null
    const losses = recordedLosses !== null ? recordedLosses : Math.max(0, gamesPlayed - wins)
    const winRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0
    const preferredColor = normalizePreferredColor(user.preferred_color)

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.email_verified,
      avatarUrl: null,
      bio: user.bio,
      tagline: user.tagline,
      elo,
      joinDate: user.created_at,
      lastActive: user.last_login,
      gamesPlayed,
      wins,
      losses,
      winRate,
      peakRating: user.peak_rating || elo,
      preferredColor,
      rank: {
        name: rank.name,
        color: rank.color,
        insignia: rank.insignia,
        rating: elo,
        minRating: rank.minRating,
        nextRank: nextRank
          ? {
              name: nextRank.name,
              minRating: nextRank.minRating,
            }
          : null,
      },
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch profile', 500, { userId: req.userId })
    return res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// Check username availability
router.post('/check-username', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { username } = req.body
    const userId = req.userId

    if (!username || username.trim().length < 3) {
      return res.status(400).json({
        available: false,
        error: 'Username must be at least 3 characters',
      })
    }

    const result = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [
      username.trim(),
      userId,
    ])

    return res.json({
      available: result.rows.length === 0,
      username: username.trim(),
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to check username availability', 500, {
      username: req.body?.username,
    })
    return res.status(500).json({ error: 'Failed to check username availability' })
  }
})

// Update user profile
router.put('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { username, email, tagline } = req.body as {
      username?: string
      email?: string
      tagline?: string
    }

    await ensureUserProfileColumns()

    // Validate inputs
    if (username && username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' })
    }

    if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    // Check if username is taken (if changing)
    if (username) {
      const usernameCheck = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [
        username.trim(),
        userId,
      ])

      if (usernameCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Username already taken' })
      }
    }

    // Check if email is taken (if changing)
    if (email) {
      const emailCheck = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [
        email.trim().toLowerCase(),
        userId,
      ])

      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Email already in use' })
      }
    }

    // Build update query dynamically
    const updates = []
    const values = []
    let paramCounter = 1

    if (username) {
      updates.push(`username = $${paramCounter++}`)
      values.push(username.trim())
    }

    if (email) {
      updates.push(`email = $${paramCounter++}`)
      values.push(email.trim().toLowerCase())
    }

    // Validate and accept tagline from the preselected list
    if (typeof tagline === 'string') {
      const { isAllowedTagline } = require('../constants/profileTaglines') as {
        isAllowedTagline: (v: unknown) => v is string
      }
      const trimmed = tagline.trim()
      if (!isAllowedTagline(trimmed)) {
        return res.status(400).json({ error: 'Invalid tagline selection' })
      }
      updates.push(`tagline = $${paramCounter++}`)
      values.push(trimmed)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    values.push(userId)

    await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCounter}`,
      values,
    )

    // Fetch updated user
    const updatedUser = await query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [userId],
    )

    return res.json({
      success: true,
      user: updatedUser.rows[0],
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to update profile', 500, { userId: req.userId })
    return res.status(500).json({ error: 'Failed to update profile' })
  }
})

// Change password
router.put('/change-password', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new passwords are required' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' })
    }

    // Get current password hash
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash)
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, userId],
    )

    return res.json({ success: true, message: 'Password updated successfully' })
  } catch (error) {
    handleRouteError(error, req, 'Failed to change password', 500, { userId: req.userId })
    return res.status(500).json({ error: 'Failed to change password' })
  }
})

export default router
// Search users by username (prefix/substring)
router.get('/search', authenticateToken, async (req: Request, res: Response) => {
  try {
    const raw = (req.query.q ?? req.query.query ?? '').toString().trim()
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50))

    if (raw.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' })
    }

    // Simple ILIKE search on username
    const result = await query(
      `
      SELECT id, username
      FROM users
      WHERE username ILIKE $1
      ORDER BY username ASC
      LIMIT $2
    `,
      [`%${raw}%`, limit],
    )

    return res.json({ users: result.rows })
  } catch (error) {
    handleRouteError(error, req, 'Failed to search users', 500, { q: req.query?.q })
    return res.status(500).json({ error: 'Failed to search users' })
  }
})
