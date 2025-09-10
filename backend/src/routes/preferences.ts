import { Router } from 'express';
import type { Pool } from 'pg';
import { authenticateToken } from '../middleware/auth';
import { UserPreferencesService } from '../services/UserPreferencesService';

export function createPreferencesRouter(pool: Pool) {
  const router = Router();
  const preferencesService = new UserPreferencesService(pool);

  // Get user preferences
  router.get('/', authenticateToken as any, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const preferences = await preferencesService.getPreferences(userId);
      
      if (!preferences) {
        return res.status(404).json({ error: 'Preferences not found' });
      }
      
      res.json(preferences);
    } catch (error) {
      console.error('Error fetching preferences:', error);
      res.status(500).json({ error: 'Failed to fetch preferences' });
    }
  });

  // Update user preferences
  router.put('/', authenticateToken as any, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const preferences = await preferencesService.updatePreferences(userId, req.body);
      
      if (!preferences) {
        return res.status(500).json({ error: 'Failed to update preferences' });
      }
      
      res.json(preferences);
    } catch (error) {
      console.error('Error updating preferences:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  });

  // Update theme specifically
  router.put('/theme', authenticateToken as any, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { theme } = req.body;
      
      if (!theme) {
        return res.status(400).json({ error: 'Theme is required' });
      }
      
      const success = await preferencesService.updateTheme(userId, theme);
      
      if (!success) {
        return res.status(500).json({ error: 'Failed to update theme' });
      }
      
      res.json({ success: true, theme });
    } catch (error) {
      console.error('Error updating theme:', error);
      res.status(500).json({ error: 'Failed to update theme' });
    }
  });

  return router;
}