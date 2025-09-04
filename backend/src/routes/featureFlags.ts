import type { Request, Response } from 'express'
import { Router } from 'express'
import { query } from '../config/database'
import { authenticateToken } from '../middleware/auth'
import { requireAdmin } from '../middleware/adminAuth'

const router = Router()

// Get all feature flags (public endpoint)
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      'SELECT flag_name, is_enabled FROM feature_flags WHERE is_enabled = true'
    )
    
    // Convert to object format for easier frontend consumption
    const flags: Record<string, boolean> = {}
    result.rows.forEach((row: any) => {
      flags[row.flag_name] = row.is_enabled
    })
    
    res.json({ flags })
  } catch (error) {
    console.error('Error fetching feature flags:', error)
    res.status(500).json({ error: 'Failed to fetch feature flags' })
  }
})

// Admin: Get all feature flags with details
router.get('/admin', authenticateToken, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      'SELECT * FROM feature_flags ORDER BY created_at DESC'
    )
    
    res.json({ flags: result.rows })
  } catch (error) {
    console.error('Error fetching admin feature flags:', error)
    res.status(500).json({ error: 'Failed to fetch feature flags' })
  }
})

// Admin: Toggle a feature flag
router.put('/:flagName', authenticateToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { flagName } = req.params
  const { enabled } = req.body
  
  try {
    const result = await query(
      'UPDATE feature_flags SET is_enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE flag_name = $2 RETURNING *',
      [enabled, flagName]
    )
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Feature flag not found' })
      return
    }
    
    res.json({ flag: result.rows[0] })
  } catch (error) {
    console.error('Error updating feature flag:', error)
    res.status(500).json({ error: 'Failed to update feature flag' })
  }
})

export default router