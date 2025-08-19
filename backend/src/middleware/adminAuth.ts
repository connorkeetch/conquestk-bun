import { Request, Response, NextFunction } from 'express';
import { adminService } from '../services/adminService';
import { logger } from '../utils/logger';

// Extend Express Request type to include admin info
declare global {
  namespace Express {
    interface Request {
      adminUser?: {
        userId: string;
        roles: string[];
        permissions: string[];
        isSuperAdmin: boolean;
      };
    }
  }
}

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isAdmin = await adminService.isAdmin(userId);
    if (!isAdmin) {
      // Log unauthorized access attempt
      await adminService.logUserActivity(
        userId, 
        'admin_access_denied',
        { route: req.path },
        req.ip,
        req.get('User-Agent')
      );
      
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get admin info for request context
    const adminInfo = await adminService.getUserAdminInfo(userId);
    req.adminUser = {
      userId,
      roles: adminInfo.map(info => info.roleName),
      permissions: adminInfo.flatMap(info => info.permissions),
      isSuperAdmin: adminInfo.some(info => info.permissions.includes('*'))
    };

    next();
  } catch (error) {
    logger.error('Admin authentication error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasPermission = await adminService.hasPermission(userId, permission);
      if (!hasPermission) {
        // Log permission denied
        await adminService.logAdminAction(
          userId,
          'permission_denied',
          { 
            requiredPermission: permission,
            route: req.path,
            method: req.method
          },
          undefined,
          undefined,
          req.ip,
          req.get('User-Agent')
        );
        
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: permission 
        });
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

export const logAdminActivity = (actionType: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the admin action after successful response
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = (req as any).userId;
        if (userId) {
          adminService.logAdminAction(
            userId,
            actionType,
            {
              route: req.path,
              method: req.method,
              body: req.body,
              params: req.params,
              query: req.query
            },
            undefined,
            undefined,
            req.ip,
            req.get('User-Agent')
          ).catch(error => {
            logger.error('Failed to log admin activity:', error);
          });
        }
      }
      
      // Call original send
      return originalSend.call(this, data);
    };
    
    next();
  };
};