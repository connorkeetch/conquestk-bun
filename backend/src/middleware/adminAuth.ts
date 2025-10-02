import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { adminService } from '../services/adminService'
import type { RequestUser } from '../types/express'
import { handleRouteError } from '../utils/routeErrorHandler'

// Extend Express Request type to include admin info
declare module 'express-serve-static-core' {
  interface Request {
    userId: string
    user?: RequestUser
    adminUser?: {
      userId: string
      roles: string[]
      permissions: string[]
      isSuperAdmin: boolean
    }
  }
}

export const requireAdmin: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.userId

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const isAdmin = await adminService.isAdmin(userId)
    if (!isAdmin) {
      // Log unauthorized access attempt
      await adminService.logUserActivity(
        userId,
        'admin_access_denied',
        { route: req.path },
        req.ip,
        req.get('User-Agent'),
      )

      res.status(403).json({ error: 'Admin access required' })
      return
    }

    // Get admin info for request context
    const adminInfo = await adminService.getUserAdminInfo(userId)
    const hasAssignedRoles = adminInfo.length > 0
    req.adminUser = {
      userId,
      roles: hasAssignedRoles ? adminInfo.map((info) => info.roleName) : ['direct_admin'],
      permissions: hasAssignedRoles ? adminInfo.flatMap((info) => info.permissions) : ['*'],
      isSuperAdmin: hasAssignedRoles
        ? adminInfo.some((info) => info.permissions.includes('*'))
        : true,
    }

    next()
  } catch (error) {
    handleRouteError(error, req, 'Admin authentication error')
    res.status(500).json({ error: 'Authentication error' })
    return
  }
}

export const requirePermission = (permission: string): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId

      if (!userId) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      if (req.adminUser?.isSuperAdmin) {
        next()
        return
      }

      const hasPermission = await adminService.hasPermission(userId, permission)
      if (!hasPermission) {
        // Log permission denied
        await adminService.logAdminAction(
          userId,
          'permission_denied',
          {
            requiredPermission: permission,
            route: req.path,
            method: req.method,
          },
          undefined,
          undefined,
          req.ip,
          req.get('User-Agent'),
        )

        res.status(403).json({
          error: 'Insufficient permissions',
          required: permission,
        })
        return
      }

      next()
    } catch (error) {
      handleRouteError(error, req, 'Permission check failed')
      res.status(500).json({ error: 'Permission check failed' })
      return
    }
  }
}

export const logAdminActivity = (actionType: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send

    res.send = function (data) {
      // Log the admin action after successful response
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.userId
        if (userId) {
          adminService
            .logAdminAction(
              userId,
              actionType,
              {
                route: req.path,
                method: req.method,
                body: req.body,
                params: req.params,
                query: req.query,
              },
              undefined,
              undefined,
              req.ip,
              req.get('User-Agent'),
            )
            .catch((error) => {
              handleRouteError(error, req, 'Failed to log admin activity')
            })
        }
      }

      // Call original send
      return originalSend.call(this, data)
    }

    next()
  }
}
