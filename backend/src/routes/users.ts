import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

// Get user profile
router.get('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    
    const result = await query(
      'SELECT id, username, email, created_at FROM users WHERE id = ?',
      [userId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    return res.json(result[0]);
  } catch (error) {
    logger.error('Error fetching user profile:', error);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Check username availability
router.post('/check-username', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    const userId = (req as any).userId;
    
    if (!username || username.trim().length < 3) {
      return res.status(400).json({ 
        available: false, 
        error: 'Username must be at least 3 characters' 
      });
    }
    
    const result = await query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [username.trim(), userId]
    );
    
    return res.json({ 
      available: result.length === 0,
      username: username.trim()
    });
  } catch (error) {
    logger.error('Error checking username:', error);
    return res.status(500).json({ error: 'Failed to check username availability' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { username, email } = req.body;
    
    // Validate inputs
    if (username && username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Check if username is taken (if changing)
    if (username) {
      const usernameCheck = await query(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username.trim(), userId]
      );
      
      if (usernameCheck.length > 0) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }
    
    // Check if email is taken (if changing)
    if (email) {
      const emailCheck = await query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email.trim().toLowerCase(), userId]
      );
      
      if (emailCheck.length > 0) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (username) {
      updates.push('username = ?');
      values.push(username.trim());
    }
    
    if (email) {
      updates.push('email = ?');
      values.push(email.trim().toLowerCase());
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(userId);
    
    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    // Fetch updated user
    const updatedUser = await query(
      'SELECT id, username, email, created_at FROM users WHERE id = ?',
      [userId]
    );
    
    return res.json({
      success: true,
      user: updatedUser[0]
    });
  } catch (error) {
    logger.error('Error updating user profile:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new passwords are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    
    // Get current password hash
    const result = await query(
      'SELECT password FROM users WHERE id = ?',
      [userId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, result[0].password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    );
    
    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Error changing password:', error);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;