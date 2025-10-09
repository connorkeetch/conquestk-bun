import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { RequestUser } from '../types/express.js';
declare module 'express-serve-static-core' {
    interface Request {
        userId: string;
        user?: RequestUser;
        adminUser?: {
            userId: string;
            roles: string[];
            permissions: string[];
            isSuperAdmin: boolean;
        };
    }
}
export declare const requireAdmin: RequestHandler;
export declare const requirePermission: (permission: string) => RequestHandler;
export declare const logAdminActivity: (actionType: string) => (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=adminAuth.d.ts.map