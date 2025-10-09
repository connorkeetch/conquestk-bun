import type { RequestHandler } from 'express';
import type { RequestUser } from '../types/express.js';
declare module 'express-serve-static-core' {
    interface Request {
        userId: string;
        user?: RequestUser;
        sessionId?: string;
    }
}
export declare const authenticateToken: RequestHandler;
//# sourceMappingURL=auth.d.ts.map