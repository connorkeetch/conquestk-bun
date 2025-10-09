export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';
export interface FriendshipRecord {
    id: string;
    userId: string;
    friendId: string;
    status: FriendshipStatus;
    requestedAt: Date;
    acceptedAt: Date | null;
}
export interface FriendSummary {
    userId: string;
    username: string;
    since?: Date;
}
export interface FriendRequestSummary {
    requesterId: string;
    requesterName: string;
    requestedAt: Date;
}
export type RelationshipStatus = 'self' | 'none' | 'pending_incoming' | 'pending_outgoing' | 'friends' | 'blocked_by_you' | 'blocked_you';
export declare function getRelationshipStatus(viewerId: string, otherUserId: string): Promise<RelationshipStatus>;
export declare function listFriends(userId: string): Promise<FriendSummary[]>;
export declare function listPendingRequests(userId: string): Promise<{
    incoming: FriendRequestSummary[];
    outgoing: FriendRequestSummary[];
}>;
export declare class FriendshipError extends Error {
    code: string;
    constructor(code: string, message: string);
}
export declare function sendFriendRequest(requesterId: string, targetUserId: string): Promise<FriendshipRecord>;
export declare function acceptFriendRequest(currentUserId: string, requesterId: string): Promise<FriendshipRecord>;
export declare function declineFriendRequest(currentUserId: string, requesterId: string): Promise<boolean>;
export declare function cancelOutgoingRequest(currentUserId: string, targetUserId: string): Promise<boolean>;
export declare function removeFriend(userId: string, friendId: string): Promise<boolean>;
declare const _default: {
    listFriends: typeof listFriends;
    listPendingRequests: typeof listPendingRequests;
    sendFriendRequest: typeof sendFriendRequest;
    acceptFriendRequest: typeof acceptFriendRequest;
    declineFriendRequest: typeof declineFriendRequest;
    cancelOutgoingRequest: typeof cancelOutgoingRequest;
    removeFriend: typeof removeFriend;
    getRelationshipStatus: typeof getRelationshipStatus;
};
export default _default;
export declare function getMutualFriends(userA: string, userB: string, limit?: number): Promise<{
    total: number;
    users: Array<{
        userId: string;
        username: string;
    }>;
}>;
//# sourceMappingURL=friendService.d.ts.map