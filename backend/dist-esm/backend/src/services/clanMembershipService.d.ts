import type { ClanApplication, ClanMember } from '../types/clans.js';
export declare class ClanMembershipServiceError extends Error {
    code: string;
    constructor(code: string, message: string);
}
export declare class ClanMembershipService {
    applyToClan(userId: string, clanId: string, message?: string | null): Promise<ClanApplication>;
    private ensureCanReview;
    reviewApplication(reviewerId: string, clanId: string, applicationId: string, decision: 'accepted' | 'rejected'): Promise<ClanApplication>;
    getMembershipForUser(userId: string): Promise<ClanMember | null>;
}
export declare const clanMembershipService: ClanMembershipService;
//# sourceMappingURL=clanMembershipService.d.ts.map