export type ChatConversationType = 'dm' | 'game' | 'team';
export interface ConversationEventSummary {
    id: string;
    kind: 'direct' | 'group' | 'game' | 'team';
    title: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    isArchived: boolean;
    isReadOnly: boolean;
    gameId: string | null;
    metadata: Record<string, unknown>;
    memberIds: string[];
}
export interface ConversationMemberEvent {
    userId: string;
    role: 'owner' | 'admin' | 'member';
    username?: string;
}
export interface ConversationCreatedPayload {
    conversation: ConversationEventSummary;
    members: ConversationMemberEvent[];
}
export interface ConversationMembersAddedPayload {
    conversationId: string;
    members: ConversationMemberEvent[];
}
export interface ConversationMembersRemovedPayload {
    conversationId: string;
    members: Array<{
        userId: string;
    }>;
}
export interface ConversationMembersChangedPayload {
    conversationId: string;
    members: ConversationMemberEvent[];
}
export interface ConversationMessageEventPayload {
    conversationId: string;
    id: string;
    senderId: string | null;
    body: string;
    createdAt: string;
    metadata: Record<string, unknown>;
}
export interface MessageSendPayload {
    conversationId: string;
    body: string;
    clientMessageId?: string;
    metadata?: Record<string, unknown>;
}
export interface MessageSendAck {
    ok: boolean;
    error?: string;
    code?: string;
    message?: ConversationMessageEventPayload;
}
export interface ConversationCreatePayload {
    kind: ConversationEventSummary['kind'];
    targetUserId?: string;
    title?: string | null;
    memberIds?: string[];
    metadata?: Record<string, unknown>;
}
export interface ConversationCreateAck {
    ok: boolean;
    error?: string;
    code?: string;
    conversation?: ConversationEventSummary & {
        memberIds: string[];
    };
}
export interface ConversationUpdatedPayload {
    conversation: ConversationEventSummary;
}
export interface ConversationMembersUpdatePayload {
    conversationId: string;
    add?: string[];
    remove?: string[];
    roleUpdates?: Array<{
        userId: string;
        role: 'admin' | 'member';
    }>;
    archive?: boolean;
}
export interface ConversationMemberUpdateError {
    type: 'add' | 'remove' | 'role' | 'archive';
    userId?: string;
    code: string;
    error: string;
}
export interface ConversationMembersUpdateAck {
    ok: boolean;
    error?: string;
    code?: string;
    added?: ConversationMemberEvent[];
    removed?: string[];
    roleUpdates?: ConversationMemberEvent[];
    archived?: boolean;
    conversation?: ConversationEventSummary;
    errors?: ConversationMemberUpdateError[];
}
export interface TypingEventPayload {
    conversationId: string;
}
export interface TypingEventResponse {
    conversationId: string;
    userId: string;
    username: string;
}
export interface ReceiptReadPayload {
    conversationId: string;
}
export interface ReceiptReadAck {
    ok: boolean;
    error?: string;
    code?: string;
}
export interface ReceiptReadEventPayload {
    conversationId: string;
    userId: string;
    lastReadMessageId: string | null;
    readAt: string;
}
//# sourceMappingURL=messaging.d.ts.map