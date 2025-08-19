import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import MapApprovalService from '../services/mapApprovalService.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Version Management Routes

// Get version history for a map
router.get('/maps/:mapId/versions', async (req, res) => {
  try {
    const { mapId } = req.params;
    const versions = await MapApprovalService.getVersionHistory(mapId);
    res.json({ versions });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Get specific version details
router.get('/versions/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;
    const version = await MapApprovalService.getVersionById(versionId);
    res.json({ version });
  } catch (error: any) {
    if (error.message === 'Version not found') {
      res.status(404).json({ message: error.message });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});

// Create new version of a map
router.post('/maps/:mapId/versions', async (req, res) => {
  try {
    const { mapId } = req.params;
    const userId = (req as any).userId;
    const versionData = req.body;
    
    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }
    
    // TODO: Check if user has permission to create versions for this map
    
    const version = await MapApprovalService.createVersion(mapId, userId, versionData);
    res.status(201).json({ version });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Set current version
router.put('/versions/:versionId/current', async (req, res) => {
  try {
    const { versionId } = req.params;
    
    // TODO: Check if user has permission to change current version
    
    await MapApprovalService.setCurrentVersion(versionId);
    res.json({ message: 'Current version updated' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Approval Request Routes

// Submit version for approval
router.post('/versions/:versionId/submit', async (req, res) => {
  try {
    const { versionId } = req.params;
    const userId = (req as any).userId;
    const { submissionNotes } = req.body;
    
    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }
    
    const approvalRequest = await MapApprovalService.submitForApproval(
      versionId, 
      userId, 
      submissionNotes
    );
    
    res.status(201).json({ approvalRequest });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
    return;
  }
});

// Get approval request details
router.get('/approval-requests/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const approvalRequest = await MapApprovalService.getApprovalRequestById(requestId);
    const reviewResults = await MapApprovalService.getReviewResults(requestId);
    
    res.json({ approvalRequest, reviewResults });
  } catch (error: any) {
    if (error.message === 'Approval request not found') {
      res.status(404).json({ message: error.message });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});

// Admin/Moderator Routes - Require admin permissions

// Get pending approval requests
router.get('/approval-requests', 
  requireAdmin, 
  async (req, res) => {
    try {
      const requests = await MapApprovalService.getPendingApprovalRequests();
      res.json({ requests });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Assign reviewer to approval request
router.put('/approval-requests/:requestId/assign', 
  requireAdmin, 
  async (req, res) => {
    try {
      const { requestId } = req.params;
      const { moderatorId } = req.body;
      const currentUserId = (req as any).userId;
      
      // If no moderatorId provided, assign to current user
      const assignedModeratorId = moderatorId || currentUserId;
      
      await MapApprovalService.assignReviewer(requestId, assignedModeratorId);
      res.json({ message: 'Reviewer assigned successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get review criteria
router.get('/review-criteria', 
  requireAdmin, 
  async (req, res) => {
    try {
      const criteria = await MapApprovalService.getReviewCriteria();
      res.json({ criteria });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Submit review results
router.post('/approval-requests/:requestId/review', 
  requireAdmin, 
  async (req, res) => {
    try {
      const { requestId } = req.params;
      const moderatorId = (req as any).userId;
      const { results, decision, moderatorFeedback } = req.body;
      
      if (!moderatorId) {
        res.status(401).json({ message: 'Moderator not authenticated' });
        return;
      }
      
      if (!results || !decision) {
        res.status(400).json({ message: 'Review results and decision are required' });
        return;
      }
      
      await MapApprovalService.submitReviewResults(
        requestId, 
        moderatorId, 
        results, 
        decision, 
        moderatorFeedback
      );
      
      res.json({ message: 'Review submitted successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Publish approved version
router.post('/versions/:versionId/publish', 
  requireAdmin, 
  async (req, res) => {
    try {
      const { versionId } = req.params;
      const moderatorId = (req as any).userId;
      
      if (!moderatorId) {
        res.status(401).json({ message: 'Moderator not authenticated' });
        return;
      }
      
      await MapApprovalService.publishVersion(versionId, moderatorId);
      res.json({ message: 'Version published successfully' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
);

// Archive map
router.post('/maps/:mapId/archive', 
  requireAdmin, 
  async (req, res) => {
    try {
      const { mapId } = req.params;
      const moderatorId = (req as any).userId;
      const { reason } = req.body;
      
      if (!moderatorId) {
        res.status(401).json({ message: 'Moderator not authenticated' });
        return;
      }
      
      await MapApprovalService.archiveMap(mapId, moderatorId, reason);
      res.json({ message: 'Map archived successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get map moderation history
router.get('/maps/:mapId/moderation-history', 
  requireAdmin, 
  async (req, res) => {
    try {
      const { mapId } = req.params;
      const history = await MapApprovalService.getMapModerationHistory(mapId);
      res.json({ history });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get approval statistics (admin dashboard)
router.get('/stats/approvals', 
  requireAdmin, 
  async (req, res) => {
    try {
      const stats = await MapApprovalService.getApprovalStats();
      res.json({ stats });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// User Permission Routes

// Get user's maps and their permissions
router.get('/my-maps', async (req, res) => {
  try {
    const userId = (req as any).userId;
    
    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }
    
    // TODO: Implement getting user's maps with permission levels
    // This would query maps table joined with map_permissions
    res.json({ maps: [] });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;