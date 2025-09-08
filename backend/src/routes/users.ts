import bcrypt from 'bcryptjs'
import { type Request, type Response, Router } from 'express'
import { query } from '../config/database'
import { authenticateToken } from '../middleware/auth'
import { logger } from '../utils/logger'

const router = Router()

// The Conqueror's Path - Conquest rank system
const CONQUEST_RANKS = [
  { name: 'Chieftain', minRating: 0, color: '#8B7355', insignia: '🛡️' },
  { name: 'Warlord', minRating: 800, color: '#C41E3A', insignia: '⚔️' },
  { name: 'Raider King', minRating: 1000, color: '#4682B4', insignia: '⚓' },
  { name: 'Sultan', minRating: 1200, color: '#228B22', insignia: '☪️' },
  { name: 'Caesar', minRating: 1400, color: '#B8860B', insignia: '🦅' },
  { name: 'Khan', minRating: 1600, color: '#8B4513', insignia: '🏹' },
  { name: 'Emperor', minRating: 1800, color: '#483D8B', insignia: '👑' },
  { name: 'The Great King', minRating: 2000, color: '#FF8C00', insignia: '☀️' },
  { name: 'Overlord', minRating: 2200, color: '#8B008B', insignia: '💀' },
  { name: 'Worldbreaker', minRating: 2400, color: '#DC143C', insignia: '☄️' },
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

// Get user profile by username (public route)
router.get('/:username/profile', async (req: Request, res: Response) => {
  try {
    const { username } = req.params

    const result = await query(
      `
      SELECT 
        u.id, u.username, u.email, u.created_at, u.email_verified, u.profile_picture, u.bio, 
        u.skill_rating, u.games_played, u.games_won, u.peak_rating, u.current_tier, u.last_login,
        us.preferred_color
      FROM users u
      LEFT JOIN user_settings us ON u.id = us.user_id
      WHERE u.username = $1 AND u.deleted_at IS NULL
    `,
      [username],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]
    const rank = getConquestRank(user.skill_rating || 1000)
    const winRate = user.games_played > 0 ? (user.games_won / user.games_played) * 100 : 0

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email, // Only visible to own profile or admins
      emailVerified: user.email_verified,
      avatarUrl: user.profile_picture,
      bio: user.bio,
      elo: user.skill_rating || 1000,
      joinDate: user.created_at,
      lastActive: user.last_login,
      gamesPlayed: user.games_played || 0,
      wins: user.games_won || 0,
      losses: (user.games_played || 0) - (user.games_won || 0),
      winRate: winRate,
      peakRating: user.peak_rating || user.skill_rating || 1000,
      preferredColor: user.preferred_color || 'bright-red',
      rank: {
        name: rank.name,
        color: rank.color,
        insignia: rank.insignia,
        rating: user.skill_rating || 1000,
      },
    })
  } catch (error) {
    logger.error('Error fetching user profile:', error)
    return res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// Get own user profile (authenticated)
router.get('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId

    const result = await query(
      `
      SELECT 
        u.id, u.username, u.email, u.created_at, u.email_verified, u.profile_picture, u.bio, 
        u.skill_rating, u.games_played, u.games_won, u.peak_rating, u.current_tier, u.last_login,
        us.preferred_color
      FROM users u
      LEFT JOIN user_settings us ON u.id = us.user_id
      WHERE u.id = $1
    `,
      [userId],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]
    const rank = getConquestRank(user.skill_rating || 1000)
    const winRate = user.games_played > 0 ? (user.games_won / user.games_played) * 100 : 0

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.email_verified,
      avatarUrl: user.profile_picture,
      bio: user.bio,
      elo: user.skill_rating || 1000,
      joinDate: user.created_at,
      lastActive: user.last_login,
      gamesPlayed: user.games_played || 0,
      wins: user.games_won || 0,
      losses: (user.games_played || 0) - (user.games_won || 0),
      winRate: winRate,
      peakRating: user.peak_rating || user.skill_rating || 1000,
      preferredColor: user.preferred_color || 'bright-red',
      rank: {
        name: rank.name,
        color: rank.color,
        insignia: rank.insignia,
        rating: user.skill_rating || 1000,
      },
    })
  } catch (error) {
    logger.error('Error fetching user profile:', error)
    return res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// Check username availability
router.post('/check-username', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { username } = req.body
    const userId = (req as any).userId

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
    logger.error('Error checking username:', error)
    return res.status(500).json({ error: 'Failed to check username availability' })
  }
})

// Update user profile
router.put('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    const { username, email } = req.body

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
    logger.error('Error updating user profile:', error)
    return res.status(500).json({ error: 'Failed to update profile' })
  }
})

// Change password
router.put('/change-password', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
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
    logger.error('Error changing password:', error)
    return res.status(500).json({ error: 'Failed to change password' })
  }
})

export default router
