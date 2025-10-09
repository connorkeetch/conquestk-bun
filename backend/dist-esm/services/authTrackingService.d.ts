export type AuthEventType = 'user_login' | 'user_logout' | 'user_registration';
interface RecordAuthEventParams {
    userId: string;
    eventType: AuthEventType;
    sessionId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
}
interface StartUserSessionParams {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    deviceInfo?: Record<string, unknown>;
    sessionData?: Record<string, unknown>;
}
declare class AuthTrackingService {
    private parseUserAgentLite;
    recordAuthEvent({ userId, eventType, sessionId, ipAddress, userAgent, metadata, }: RecordAuthEventParams): Promise<void>;
    startUserSession({ userId, ipAddress, userAgent, deviceInfo, sessionData, }: StartUserSessionParams): Promise<string | null>;
    endUserSession(sessionId: string): Promise<void>;
    closeStaleSessions(maxAgeHours: number): Promise<number>;
}
export declare const authTrackingService: AuthTrackingService;
export {};
//# sourceMappingURL=authTrackingService.d.ts.map