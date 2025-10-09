import type { PoolClient } from 'pg';
interface ClanActivityOptions {
    clanId: string;
    actorUserId?: string | null;
    actionType: string;
    metadata?: Record<string, unknown>;
    targetId?: string | null;
    client?: PoolClient;
}
export declare function logClanActivity({ clanId, actorUserId, actionType, metadata, targetId, client, }: ClanActivityOptions): Promise<void>;
export {};
//# sourceMappingURL=clanActivityService.d.ts.map