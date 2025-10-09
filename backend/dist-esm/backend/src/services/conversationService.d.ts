export declare const MAX_MESSAGE_LENGTH = 2000;
export declare const MAX_GROUP_MEMBERS = 50;
export type ConversationKind = 'direct' | 'group' | 'game';
export interface ConversationRecord {
    id: string;
    kind: ConversationKind;
    title: string | null;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    isArchived: boolean;
    isReadOnly: boolean;
    gameId: string | null;
    clanId?: string | null;
    metadata: Record<string, unknown>;
}
export interface ConversationMemberRole {
    userId: string;
    role: 'owner' | 'admin' | 'member';
    joinedAt: Date;
    shadowMuted: boolean;
    username: string;
}
export interface ConversationWithMembers extends ConversationRecord {
    memberIds: string[];
    memberRoles: ConversationMemberRole[];
}
export interface ConversationMessageRecord {
    id: string;
    conversationId: string;
    senderId: string | null;
    body: string;
    jsonMetadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    editedAt: Date | null;
    shadowMuted: boolean;
}
export interface ConversationMessageEventPayload {
    conversationId: string;
    id: string;
    senderId: string | null;
    body: string;
    createdAt: string;
    metadata: Record<string, unknown>;
}
export declare class ConversationError extends Error {
    code: string;
    constructor(code: string, message: string);
}
type ConversationAccessLevel = 'member' | 'spectator';
interface ResolveConversationAccessOptions {
    allowSpectatorGameAccess?: boolean;
}
export declare function ensureDirectConversation(initiatorId: string, targetUserId: string): Promise<ConversationWithMembers>;
export declare function createGroupConversation(options: CreateGroupConversationOptions): Promise<ConversationWithMembers>;
export declare function addMembersToConversation(options: AddConversationMembersOptions): Promise<ConversationMemberRole[]>;
export declare function ensureGameConversation(gameId: string): Promise<ConversationWithMembers>;
export declare function ensureClanConversation(clanId: string): Promise<ConversationWithMembers>;
export declare function ensureTeamConversation(gameId: string, teamId: number): Promise<ConversationWithMembers>;
export declare function leaveConversation(conversationId: string, userId: string): Promise<void>;
export declare function removeConversationMember(options: RemoveConversationMemberOptions): Promise<void>;
export declare function updateConversationMemberRole(options: UpdateConversationMemberRoleOptions): Promise<ConversationMemberRole>;
export declare function setConversationArchived(options: SetConversationArchivedOptions): Promise<ConversationWithMembers>;
export interface SendMessageOptions {
    conversationId: string;
    senderId: string;
    body: string;
    clientMessageId?: string;
    metadata?: Record<string, unknown>;
}
export interface CreateGroupConversationOptions {
    creatorId: string;
    title?: string | null;
    memberIds: string[];
    metadata?: Record<string, unknown>;
}
export interface AddConversationMembersOptions {
    actorId: string;
    conversationId: string;
    memberIds: string[];
}
export interface RemoveConversationMemberOptions {
    actorId: string;
    conversationId: string;
    targetUserId: string;
}
export interface UpdateConversationMemberRoleOptions {
    actorId: string;
    conversationId: string;
    targetUserId: string;
    role: 'admin' | 'member';
}
export interface SetConversationArchivedOptions {
    actorId: string;
    conversationId: string;
    archived: boolean;
}
export declare function sendMessage(options: SendMessageOptions): Promise<ConversationMessageRecord>;
export declare function listMessages(conversationId: string, userId: string, limit?: number, before?: string): Promise<ConversationMessageRecord[]>;
export interface ConversationMembershipInfo {
    role: 'owner' | 'admin' | 'member';
    joinedAt: Date;
    isMuted: boolean;
    isPinned: boolean;
    shadowMuted: boolean;
    lastReadMessageId: string | null;
    lastReadAt: Date | null;
    accessLevel: ConversationAccessLevel;
}
export interface ConversationListEntry {
    conversation: ConversationWithMembers;
    membership: ConversationMembershipInfo;
    unreadCount: number;
    lastMessage?: {
        id: string;
        body: string;
        senderId: string | null;
        createdAt: Date;
        metadata: Record<string, unknown>;
    };
}
export interface ConversationListOptions {
    limit?: number;
    offset?: number;
}
export declare function markConversationRead(conversationId: string, userId: string): Promise<void>;
export interface ConversationDetailResult {
    conversation: ConversationWithMembers;
    membership: ConversationMembershipInfo;
    unreadCount: number;
}
export declare function getConversationDetail(conversationId: string, userId: string, options?: ResolveConversationAccessOptions): Promise<ConversationDetailResult>;
export interface UnreadSummaryEntry {
    conversationId: string;
    unreadCount: number;
}
export declare function getUnreadSummary(userId: string): Promise<UnreadSummaryEntry[]>;
export declare function listConversationsForUser(userId: string, options?: ConversationListOptions): Promise<ConversationListEntry[]>;
declare const _default: {
    ensureDirectConversation: typeof ensureDirectConversation;
    createGroupConversation: typeof createGroupConversation;
    addMembersToConversation: typeof addMembersToConversation;
    leaveConversation: typeof leaveConversation;
    removeConversationMember: typeof removeConversationMember;
    updateConversationMemberRole: typeof updateConversationMemberRole;
    setConversationArchived: typeof setConversationArchived;
    ensureGameConversation: typeof ensureGameConversation;
    ensureTeamConversation: typeof ensureTeamConversation;
    markConversationRead: typeof markConversationRead;
    getConversationDetail: typeof getConversationDetail;
    listConversationsForUser: typeof listConversationsForUser;
    getUnreadSummary: typeof getUnreadSummary;
    sendMessage: typeof sendMessage;
    listMessages: typeof listMessages;
};
export default _default;
//# sourceMappingURL=conversationService.d.ts.map