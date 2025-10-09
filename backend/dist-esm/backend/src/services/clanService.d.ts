import type { PoolClient } from 'pg';
import type { Clan, ClanCreateRequest, ClanDetails, ClanListFilters, ClanListResult, ClanMemberStatus, ClanMembershipContext } from '../types/clans.js';
export declare class ClanServiceError extends Error {
    code: string;
    constructor(code: string, message: string);
}
export declare class ClanService {
    private normalizeName;
    private normalizeTag;
    private normalizeRecruitmentPolicy;
    private normalizeSlugBase;
    private mapClan;
    private mapMember;
    private mapAnnouncement;
    private buildListConditions;
    private buildListQuery;
    private ensureUniqueSlug;
    listClans(filters?: ClanListFilters): Promise<ClanListResult>;
    getClanBySlug(slug: string): Promise<ClanDetails | null>;
    getClanById(clanId: string): Promise<Clan | null>;
    createClan(ownerUserId: string, payload: ClanCreateRequest): Promise<ClanDetails>;
    getMemberRoleId(clanId: string, roleName: string, client?: PoolClient): Promise<string | null>;
    getActiveMembership(userId: string): Promise<{
        clanId: string;
        clanSlug: string;
        clanName: string;
        roleName?: string | null;
        status: ClanMemberStatus;
    } | null>;
    private mapActivityEvent;
    getActiveMembershipsForUsers(userIds: string[]): Promise<Map<string, ClanMembershipContext>>;
}
export declare const clanService: ClanService;
//# sourceMappingURL=clanService.d.ts.map