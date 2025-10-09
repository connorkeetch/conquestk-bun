export interface UserBlockRecord {
    id: string;
    blockerId: string;
    blockedId: string;
    createdAt: Date;
}
export declare function createBlock(blockerId: string, blockedId: string): Promise<UserBlockRecord>;
export declare function removeBlock(blockerId: string, blockedId: string): Promise<boolean>;
export declare function isBlocked(userA: string, userB: string): Promise<boolean>;
export declare function getBlocksForUser(userId: string): Promise<UserBlockRecord[]>;
export declare function getBlockRecords(options: {
    limit?: number;
    offset?: number;
    blockerId?: string;
    blockedId?: string;
}): Promise<UserBlockRecord[]>;
//# sourceMappingURL=userBlockService.d.ts.map