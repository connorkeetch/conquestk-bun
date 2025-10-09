import type { NextFunction, Request, Response } from 'express';
export declare function stopRateLimiterCleanup(): void;
export declare const authLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const loginSlowDown: import("express-rate-limit").RateLimitRequestHandler;
export declare const gameCreationLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const messageLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const passwordResetLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const mapUploadLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const generalApiLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const adminLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const socketConnectionLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare class SuspiciousActivityTracker {
    private suspiciousIPs;
    private blockedIPs;
    private readonly THRESHOLD;
    private readonly BLOCK_DURATION;
    private getRedis;
    recordViolation(ip: string): Promise<void>;
    private recordViolationInMemory;
    blockIP(ip: string): Promise<void>;
    private blockIPInMemory;
    isBlocked(ip: string): Promise<boolean>;
    middleware(): (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const suspiciousActivityTracker: SuspiciousActivityTracker;
export declare const standardLimiter: import("express-rate-limit").RateLimitRequestHandler;
//# sourceMappingURL=rateLimiter.d.ts.map