export type DmPolicy = 'everyone' | 'friends_only' | 'no_one';
export interface MessagingSettings {
    dmPolicy: DmPolicy;
    allowGroupInvites: boolean;
    showOnlineStatus: boolean;
}
export declare class MessagingPolicyError extends Error {
    code: string;
    constructor(code: string, message: string);
}
export declare function getMessagingSettings(userId: string): Promise<MessagingSettings>;
export declare function assertCanStartDirectConversation(initiatorId: string, targetUserId: string): Promise<void>;
export declare function assertCanSendDirectMessage(senderId: string, recipientId: string): Promise<void>;
export declare function assertCanInviteToGroup(inviterId: string, invitedUserId: string): Promise<void>;
//# sourceMappingURL=messagingPolicyService.d.ts.map