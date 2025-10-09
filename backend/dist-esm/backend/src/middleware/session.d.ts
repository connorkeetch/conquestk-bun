import type { NextFunction, Request, RequestHandler, Response } from 'express';
export declare function createSessionMiddleware(): RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export declare function enableRedisSessionStore(): boolean;
export declare function sessionMiddleware(req: Request, res: Response, next: NextFunction): unknown;
declare module 'express-session' {
    interface SessionData {
        userId?: string;
        username?: string;
        lastActivity?: Date;
        gameRoom?: string;
        socketId?: string;
    }
}
//# sourceMappingURL=session.d.ts.map