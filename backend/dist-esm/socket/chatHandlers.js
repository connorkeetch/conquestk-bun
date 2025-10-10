import { addMembersToConversation, ConversationError, createGroupConversation, ensureDirectConversation, getConversationDetail, markConversationRead, removeConversationMember, sendMessage as sendConversationMessage, setConversationArchived, updateConversationMemberRole, } from '../services/conversationService.js';
import notificationService from '../services/notificationService.js';
import { logger } from '../utils/logger.js';
const toIso = (value) => {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'string') {
        return new Date(value).toISOString();
    }
    return new Date().toISOString();
};
const ensureJoinedSet = (socket) => {
    if (!socket.joinedConversations) {
        socket.joinedConversations = new Set();
    }
    return socket.joinedConversations;
};
const joinConversationRoom = async (socket, conversationId) => {
    const joined = ensureJoinedSet(socket);
    if (!joined.has(conversationId)) {
        await socket.join(`conversation:${conversationId}`);
        joined.add(conversationId);
    }
};
const getPartnerId = (conversation, userId) => {
    for (const memberId of conversation.memberIds) {
        if (memberId !== userId) {
            return memberId;
        }
    }
    return null;
};
const toConversationMessageEventPayload = (message) => ({
    conversationId: message.conversationId,
    id: message.id,
    senderId: message.senderId,
    body: message.body,
    createdAt: toIso(message.createdAt),
    metadata: message.jsonMetadata ?? {},
});
const mapConversationToSummary = (conversation) => ({
    id: conversation.id,
    kind: conversation.kind,
    title: conversation.title,
    createdBy: conversation.createdBy,
    createdAt: toIso(conversation.createdAt),
    updatedAt: toIso(conversation.updatedAt),
    isArchived: conversation.isArchived,
    isReadOnly: conversation.isReadOnly,
    gameId: conversation.gameId,
    metadata: conversation.metadata,
    memberIds: conversation.memberIds,
});
const mapConversationError = (error) => ({
    ok: false,
    error: error.message,
    code: error.code,
});
const ackSuccess = (callback, payload) => {
    if (callback) {
        callback(payload);
    }
};
const ackError = (callback, payload) => {
    if (callback) {
        callback(payload);
    }
};
const getUserInfo = async (userId) => {
    const { query } = await import('../config/database.js');
    const result = await query('SELECT username FROM users WHERE id = $1', [
        userId,
    ]);
    return result.rows[0] || { username: 'Unknown User' };
};
const sendDMNotification = async (recipientId, senderId, senderUsername, message) => {
    const preview = message.length > 140 ? `${message.substring(0, 137)}...` : message;
    const sendPush = await notificationService.shouldSendDMPush(recipientId);
    await notificationService.createInAppNotification(recipientId, {
        type: 'chat_message',
        title: `New message from ${senderUsername}`,
        message: preview || 'You received a new message',
        data: { senderId, senderUsername },
        actionUrl: `/messages/${senderId}`,
        actionLabel: 'Open chat',
        sendPush,
        pushPayload: {
            title: `💬 ${senderUsername} sent a message`,
            body: preview || 'Open ConquestK to read the message',
            data: {
                url: `/messages/${senderId}`,
                senderId,
            },
        },
    });
};
const maybeSendDirectMessageNotification = async (conversation, senderId, body) => {
    if (conversation.kind !== 'direct') {
        return;
    }
    const partnerId = getPartnerId(conversation, senderId);
    if (!partnerId) {
        return;
    }
    const senderInfo = await getUserInfo(senderId);
    await sendDMNotification(partnerId, senderId, senderInfo.username, body);
};
const ensureConversationAccess = async (socket, conversationId, userId) => {
    const detail = await getConversationDetail(conversationId, userId, {
        allowSpectatorGameAccess: true,
    });
    await joinConversationRoom(socket, conversationId);
    return detail;
};
const ensureDirectConversationAccess = async (socket, userId, partnerId) => {
    const conversation = await ensureDirectConversation(userId, partnerId);
    await joinConversationRoom(socket, conversation.id);
    return conversation;
};
const sanitizeMetadata = (metadata) => {
    if (metadata === undefined) {
        return undefined;
    }
    if (metadata === null) {
        return undefined;
    }
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
        throw new ConversationError('INVALID_METADATA', 'metadata must be an object when provided');
    }
    return metadata;
};
const sendConversationMessageForUser = async (socket, options) => {
    const trimmed = options.body.trim();
    if (!trimmed) {
        throw new ConversationError('EMPTY_MESSAGE', 'Message cannot be empty');
    }
    let descriptor;
    if (options.descriptor) {
        descriptor = options.descriptor;
    }
    else {
        const detail = await ensureConversationAccess(socket, options.conversationId, options.userId);
        descriptor = detail.conversation;
    }
    const message = await sendConversationMessage({
        conversationId: descriptor.id,
        senderId: options.userId,
        body: trimmed,
        clientMessageId: options.clientMessageId,
        metadata: options.metadata,
    });
    await maybeSendDirectMessageNotification(descriptor, options.userId, trimmed);
    return { message, descriptor, body: trimmed };
};
const broadcastTypingEvent = async (io, socket, conversationId, userId, state) => {
    const _detail = await ensureConversationAccess(socket, conversationId, userId);
    const userInfo = await getUserInfo(userId);
    const payload = {
        conversationId,
        userId,
        username: userInfo.username,
    };
    io.to(`conversation:${conversationId}`).emit(`typing.${state}`, payload);
    io.to(`user:${userId}`).emit(`typing.${state}`, payload);
};
const broadcastReceiptRead = async (io, socket, conversationId, userId) => {
    const detail = await ensureConversationAccess(socket, conversationId, userId);
    if (detail.membership.accessLevel === 'spectator') {
        const payload = {
            conversationId,
            userId,
            lastReadMessageId: null,
            readAt: toIso(new Date()),
        };
        return payload;
    }
    await markConversationRead(conversationId, userId);
    const refreshed = await getConversationDetail(conversationId, userId, {
        allowSpectatorGameAccess: true,
    });
    const payload = {
        conversationId,
        userId,
        lastReadMessageId: refreshed.membership.lastReadMessageId,
        readAt: toIso(refreshed.membership.lastReadAt),
    };
    io.to(`conversation:${conversationId}`).emit('receipt.read', payload);
    io.to(`user:${userId}`).emit('receipt.read', payload);
    return payload;
};
const handleConversationMembersUpdate = async (_io, socket, actorId, payload, callback) => {
    try {
        const { conversationId } = payload;
        if (!conversationId || typeof conversationId !== 'string') {
            return ackError(callback, {
                ok: false,
                error: 'conversationId is required',
                code: 'INVALID_INPUT',
            });
        }
        await ensureConversationAccess(socket, conversationId, actorId);
        const additions = Array.isArray(payload.add)
            ? Array.from(new Set(payload.add.filter((id) => typeof id === 'string' && id !== actorId)))
            : [];
        const removals = Array.isArray(payload.remove)
            ? Array.from(new Set(payload.remove.filter((id) => typeof id === 'string' && id !== actorId)))
            : [];
        const roleUpdatesPayload = Array.isArray(payload.roleUpdates) ? payload.roleUpdates : [];
        const roleUpdates = [];
        const seenRoleUpdates = new Set();
        const errors = [];
        for (const update of roleUpdatesPayload) {
            if (!update || typeof update.userId !== 'string' || typeof update.role !== 'string') {
                errors.push({
                    type: 'role',
                    code: 'INVALID_INPUT',
                    error: 'roleUpdates require userId and role',
                });
                continue;
            }
            const normalizedRole = update.role === 'admin' ? 'admin' : update.role === 'member' ? 'member' : null;
            if (!normalizedRole) {
                errors.push({
                    type: 'role',
                    userId: update.userId,
                    code: 'INVALID_ROLE',
                    error: 'roleUpdates role must be "admin" or "member"',
                });
                continue;
            }
            if (update.userId === actorId) {
                errors.push({
                    type: 'role',
                    userId: update.userId,
                    code: 'INVALID_TARGET',
                    error: 'Cannot change your own role through this endpoint',
                });
                continue;
            }
            if (!seenRoleUpdates.has(update.userId)) {
                seenRoleUpdates.add(update.userId);
                roleUpdates.push({ userId: update.userId, role: normalizedRole });
            }
        }
        const addedMembers = [];
        for (const memberId of additions) {
            try {
                const members = await addMembersToConversation({
                    actorId,
                    conversationId,
                    memberIds: [memberId],
                });
                for (const member of members) {
                    addedMembers.push({ userId: member.userId, role: member.role });
                }
            }
            catch (error) {
                if (error instanceof ConversationError) {
                    errors.push({ type: 'add', userId: memberId, code: error.code, error: error.message });
                }
                else {
                    logger.error('Failed to add conversation member', { error });
                    errors.push({
                        type: 'add',
                        userId: memberId,
                        code: 'UNKNOWN_ERROR',
                        error: 'Failed to add member',
                    });
                }
            }
        }
        const removedMembers = [];
        for (const removeId of removals) {
            try {
                await removeConversationMember({
                    actorId,
                    conversationId,
                    targetUserId: removeId,
                });
                removedMembers.push(removeId);
            }
            catch (error) {
                if (error instanceof ConversationError) {
                    errors.push({ type: 'remove', userId: removeId, code: error.code, error: error.message });
                }
                else {
                    logger.error('Failed to remove conversation member', { error });
                    errors.push({
                        type: 'remove',
                        userId: removeId,
                        code: 'UNKNOWN_ERROR',
                        error: 'Failed to remove member',
                    });
                }
            }
        }
        const roleResults = [];
        for (const update of roleUpdates) {
            try {
                const updated = await updateConversationMemberRole({
                    actorId,
                    conversationId,
                    targetUserId: update.userId,
                    role: update.role,
                });
                roleResults.push({ userId: updated.userId, role: updated.role });
            }
            catch (error) {
                if (error instanceof ConversationError) {
                    errors.push({
                        type: 'role',
                        userId: update.userId,
                        code: error.code,
                        error: error.message,
                    });
                }
                else {
                    logger.error('Failed to update conversation member role', { error });
                    errors.push({
                        type: 'role',
                        userId: update.userId,
                        code: 'UNKNOWN_ERROR',
                        error: 'Failed to update role',
                    });
                }
            }
        }
        let archivedState;
        let conversationSummary;
        if (typeof payload.archive === 'boolean') {
            try {
                const descriptor = await setConversationArchived({
                    actorId,
                    conversationId,
                    archived: payload.archive,
                });
                archivedState = descriptor.isArchived;
                conversationSummary = mapConversationToSummary(descriptor);
            }
            catch (error) {
                if (error instanceof ConversationError) {
                    errors.push({ type: 'archive', code: error.code, error: error.message });
                }
                else {
                    logger.error('Failed to update conversation archive state', { error });
                    errors.push({
                        type: 'archive',
                        code: 'UNKNOWN_ERROR',
                        error: 'Failed to update archive state',
                    });
                }
            }
        }
        if (!conversationSummary) {
            try {
                const detail = await getConversationDetail(conversationId, actorId);
                conversationSummary = mapConversationToSummary(detail.conversation);
                archivedState = detail.conversation.isArchived;
            }
            catch (error) {
                logger.warn('Failed to refresh conversation summary after update', {
                    conversationId,
                    error,
                });
            }
        }
        ackSuccess(callback, {
            ok: errors.length === 0,
            added: addedMembers.length > 0 ? addedMembers : undefined,
            removed: removedMembers.length > 0 ? removedMembers : undefined,
            roleUpdates: roleResults.length > 0 ? roleResults : undefined,
            archived: archivedState,
            conversation: conversationSummary,
            errors: errors.length > 0 ? errors : undefined,
        });
    }
    catch (error) {
        if (error instanceof ConversationError) {
            return ackError(callback, mapConversationError(error));
        }
        logger.error('conversation.members.update handler failed', { error });
        ackError(callback, {
            ok: false,
            error: 'Failed to update members',
            code: 'UNKNOWN_ERROR',
        });
    }
};
export const setupChatHandlers = (io, socket) => {
    const requireUserId = () => {
        const { userId } = socket;
        if (!userId) {
            socket.emit('error', {
                event: 'conversation.auth',
                message: 'Not authenticated',
                timestamp: new Date().toISOString(),
            });
            return null;
        }
        return userId;
    };
    const emitConversationError = (message) => {
        socket.emit('error', {
            event: 'conversation',
            message,
            timestamp: new Date().toISOString(),
        });
    };
    socket.on('message.send', async (data, callback) => {
        try {
            const userId = requireUserId();
            if (!userId)
                return;
            if (!data || typeof data.conversationId !== 'string') {
                return ackError(callback, {
                    ok: false,
                    error: 'conversationId is required',
                    code: 'INVALID_INPUT',
                });
            }
            if (typeof data.body !== 'string') {
                return ackError(callback, { ok: false, error: 'body is required', code: 'INVALID_INPUT' });
            }
            const metadata = sanitizeMetadata(data.metadata);
            const { message } = await sendConversationMessageForUser(socket, {
                ...data,
                metadata,
                userId,
            });
            ackSuccess(callback, {
                ok: true,
                message: toConversationMessageEventPayload(message),
            });
        }
        catch (error) {
            if (error instanceof ConversationError) {
                return ackError(callback, mapConversationError(error));
            }
            logger.error('message.send handler failed', { error });
            ackError(callback, {
                ok: false,
                error: 'Failed to send message',
                code: 'UNKNOWN_ERROR',
            });
        }
    });
    socket.on('receipt.read', async (data, callback) => {
        try {
            const userId = requireUserId();
            if (!userId)
                return;
            if (!data || typeof data.conversationId !== 'string') {
                return ackError(callback, {
                    ok: false,
                    error: 'conversationId is required',
                    code: 'INVALID_INPUT',
                });
            }
            await broadcastReceiptRead(io, socket, data.conversationId, userId);
            ackSuccess(callback, { ok: true });
        }
        catch (error) {
            if (error instanceof ConversationError) {
                return ackError(callback, mapConversationError(error));
            }
            logger.error('receipt.read handler failed', { error });
            ackError(callback, { ok: false, error: 'Failed to mark read', code: 'UNKNOWN_ERROR' });
        }
    });
    socket.on('typing.start', async (data) => {
        try {
            const userId = requireUserId();
            if (!userId)
                return;
            if (!data || typeof data.conversationId !== 'string') {
                emitConversationError('conversationId is required for typing events');
                return;
            }
            await broadcastTypingEvent(io, socket, data.conversationId, userId, 'start');
        }
        catch (error) {
            logger.error('typing.start handler failed', { error });
        }
    });
    socket.on('typing.stop', async (data) => {
        try {
            const userId = requireUserId();
            if (!userId)
                return;
            if (!data || typeof data.conversationId !== 'string') {
                emitConversationError('conversationId is required for typing events');
                return;
            }
            await broadcastTypingEvent(io, socket, data.conversationId, userId, 'stop');
        }
        catch (error) {
            logger.error('typing.stop handler failed', { error });
        }
    });
    socket.on('conversation.create', async (data, callback) => {
        try {
            const userId = requireUserId();
            if (!userId)
                return;
            if (!data || (data.kind !== 'direct' && data.kind !== 'group')) {
                return ackError(callback, {
                    ok: false,
                    error: 'kind must be "direct" or "group"',
                    code: 'INVALID_INPUT',
                });
            }
            let conversation;
            if (data.kind === 'direct') {
                if (!data.targetUserId || typeof data.targetUserId !== 'string') {
                    return ackError(callback, {
                        ok: false,
                        error: 'targetUserId is required for direct conversations',
                        code: 'INVALID_INPUT',
                    });
                }
                conversation = await ensureDirectConversationAccess(socket, userId, data.targetUserId);
            }
            else {
                if (!Array.isArray(data.memberIds) || data.memberIds.length === 0) {
                    return ackError(callback, {
                        ok: false,
                        error: 'memberIds must include at least one user',
                        code: 'INVALID_INPUT',
                    });
                }
                const metadata = sanitizeMetadata(data.metadata);
                conversation = await createGroupConversation({
                    creatorId: userId,
                    title: typeof data.title === 'string' ? data.title : undefined,
                    memberIds: data.memberIds,
                    metadata,
                });
                await joinConversationRoom(socket, conversation.id);
            }
            ackSuccess(callback, {
                ok: true,
                conversation: mapConversationToSummary(conversation),
            });
        }
        catch (error) {
            if (error instanceof ConversationError) {
                return ackError(callback, mapConversationError(error));
            }
            logger.error('conversation.create handler failed', { error });
            ackError(callback, {
                ok: false,
                error: 'Failed to create conversation',
                code: 'UNKNOWN_ERROR',
            });
        }
    });
    socket.on('conversation.members.update', async (payload, callback) => {
        const userId = requireUserId();
        if (!userId)
            return;
        await handleConversationMembersUpdate(io, socket, userId, payload, callback);
    });
};
//# sourceMappingURL=chatHandlers.js.map