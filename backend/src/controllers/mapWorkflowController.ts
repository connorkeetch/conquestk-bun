import { Request, Response } from 'express';
import mapWorkflowService from '../services/mapWorkflowService';
import { logger } from '../utils/logger';
import { UserService } from '../services/userService';

const userService = new UserService();

export class MapWorkflowController {
  /**
   * Save a draft
   */
  async saveDraft(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      const draftData = req.body;
      
      const draft = await mapWorkflowService.saveDraft(userId, draftData);
      
      return res.json({
        success: true,
        draft
      });
    } catch (error) {
      logger.error('Error saving draft:', error);
      return res.status(500).json({
        error: 'Failed to save draft',
        message: 'An error occurred while saving your draft'
      });
    }
  }

  /**
   * Get user's drafts
   */
  async getUserDrafts(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      
      const drafts = await mapWorkflowService.getUserDrafts(userId);
      
      return res.json({
        success: true,
        drafts
      });
    } catch (error) {
      logger.error('Error fetching drafts:', error);
      return res.status(500).json({
        error: 'Failed to fetch drafts',
        message: 'An error occurred while fetching your drafts'
      });
    }
  }

  /**
   * Submit map for review
   */
  async submitForReview(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      const { mapId } = req.params;
      
      await mapWorkflowService.submitForReview(mapId, userId);
      
      return res.json({
        success: true,
        message: 'Map submitted for review successfully'
      });
    } catch (error) {
      logger.error('Error submitting map for review:', error);
      return res.status(500).json({
        error: 'Failed to submit map',
        message: 'An error occurred while submitting your map for review'
      });
    }
  }

  /**
   * Get pending reviews (admin only)
   */
  async getPendingReviews(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      
      // Check if user is admin
      const user = await userService.findById(userId);
      if (!user?.is_admin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }
      
      const reviews = await mapWorkflowService.getPendingReviews();
      
      return res.json({
        success: true,
        reviews
      });
    } catch (error) {
      logger.error('Error fetching pending reviews:', error);
      return res.status(500).json({
        error: 'Failed to fetch reviews',
        message: 'An error occurred while fetching pending reviews'
      });
    }
  }

  /**
   * Approve map (admin only)
   */
  async approveMap(req: Request, res: Response) {
    try {
      const adminId = (req as any).userId;
      const { mapId } = req.params;
      const { notes } = req.body;
      
      // Check if user is admin
      const user = await userService.findById(adminId);
      if (!user?.is_admin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }
      
      await mapWorkflowService.approveMap(mapId, adminId, notes);
      
      return res.json({
        success: true,
        message: 'Map approved successfully'
      });
    } catch (error) {
      logger.error('Error approving map:', error);
      return res.status(500).json({
        error: 'Failed to approve map',
        message: 'An error occurred while approving the map'
      });
    }
  }

  /**
   * Reject map (admin only)
   */
  async rejectMap(req: Request, res: Response) {
    try {
      const adminId = (req as any).userId;
      const { mapId } = req.params;
      const { reason } = req.body;
      
      if (!reason) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Rejection reason is required'
        });
      }
      
      // Check if user is admin
      const user = await userService.findById(adminId);
      if (!user?.is_admin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }
      
      await mapWorkflowService.rejectMap(mapId, adminId, reason);
      
      return res.json({
        success: true,
        message: 'Map rejected'
      });
    } catch (error) {
      logger.error('Error rejecting map:', error);
      return res.status(500).json({
        error: 'Failed to reject map',
        message: 'An error occurred while rejecting the map'
      });
    }
  }

  /**
   * Get admin notifications
   */
  async getAdminNotifications(req: Request, res: Response) {
    try {
      const adminId = (req as any).userId;
      const { unreadOnly } = req.query;
      
      // Check if user is admin
      const user = await userService.findById(adminId);
      if (!user?.is_admin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }
      
      const notifications = await mapWorkflowService.getAdminNotifications(
        adminId, 
        unreadOnly === 'true'
      );
      
      return res.json({
        success: true,
        notifications
      });
    } catch (error) {
      logger.error('Error fetching notifications:', error);
      return res.status(500).json({
        error: 'Failed to fetch notifications',
        message: 'An error occurred while fetching notifications'
      });
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(req: Request, res: Response) {
    try {
      const adminId = (req as any).userId;
      const { notificationId } = req.params;
      
      // Check if user is admin
      const user = await userService.findById(adminId);
      if (!user?.is_admin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }
      
      await mapWorkflowService.markNotificationRead(notificationId, adminId);
      
      return res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      return res.status(500).json({
        error: 'Failed to update notification',
        message: 'An error occurred while updating the notification'
      });
    }
  }

  /**
   * Archive map (admin only)
   */
  async archiveMap(req: Request, res: Response) {
    try {
      const adminId = (req as any).userId;
      const { mapId } = req.params;
      
      // Check if user is admin
      const user = await userService.findById(adminId);
      if (!user?.is_admin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }
      
      await mapWorkflowService.archiveMap(mapId, adminId);
      
      return res.json({
        success: true,
        message: 'Map archived successfully'
      });
    } catch (error) {
      logger.error('Error archiving map:', error);
      return res.status(500).json({
        error: 'Failed to archive map',
        message: 'An error occurred while archiving the map'
      });
    }
  }

  /**
   * Toggle map featured status (admin only)
   */
  async toggleFeatured(req: Request, res: Response) {
    try {
      const adminId = (req as any).userId;
      const { mapId } = req.params;
      
      // Check if user is admin
      const user = await userService.findById(adminId);
      if (!user?.is_admin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }
      
      await mapWorkflowService.toggleMapFeatured(mapId, adminId);
      
      return res.json({
        success: true,
        message: 'Map featured status updated'
      });
    } catch (error) {
      logger.error('Error toggling featured status:', error);
      return res.status(500).json({
        error: 'Failed to update map',
        message: 'An error occurred while updating the map'
      });
    }
  }

  /**
   * Get maps by status (admin only)
   */
  async getMapsByStatus(req: Request, res: Response) {
    try {
      const adminId = (req as any).userId;
      const { status } = req.params;
      
      // Check if user is admin
      const user = await userService.findById(adminId);
      if (!user?.is_admin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }
      
      const validStatuses = ['draft', 'pending_review', 'approved', 'rejected', 'archived'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Invalid status',
          message: `Status must be one of: ${validStatuses.join(', ')}`
        });
      }
      
      const maps = await mapWorkflowService.getMapsByStatus(status as any);
      
      return res.json({
        success: true,
        maps
      });
    } catch (error) {
      logger.error('Error fetching maps by status:', error);
      return res.status(500).json({
        error: 'Failed to fetch maps',
        message: 'An error occurred while fetching maps'
      });
    }
  }

  /**
   * Get map submission history
   */
  async getMapHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      const { mapId } = req.params;
      
      // Check if user is admin
      const user = await userService.findById(userId);
      if (!user?.is_admin) {
        // Non-admins can only see their own map history
        // TODO: Add check to verify user owns the map
      }
      
      const history = await mapWorkflowService.getMapHistory(mapId);
      
      return res.json({
        success: true,
        history
      });
    } catch (error) {
      logger.error('Error fetching map history:', error);
      return res.status(500).json({
        error: 'Failed to fetch history',
        message: 'An error occurred while fetching map history'
      });
    }
  }
}