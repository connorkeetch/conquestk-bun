import { query, transaction } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { assertCanInviteToGroup, assertCanSendDirectMessage, assertCanStartDirectConversation, MessagingPolicyError, } from './messagingPolicyService.js';
import { tryGetSocketServer } from './socketRegistry.js';
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_GROUP_MEMBERS = 50;
export class ConversationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ConversationError';
        this.code = code;
    }
}
const CONVERSATION_COLUMNS = `
  id,
  kind,
  title,
  created_by,
  created_at,
  updated_at,
  is_archived,
  is_read_only,
  game_id,
  metadata
`;
const mapConversationRow = (row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isArchived: row.is_archived,
    isReadOnly: row.is_read_only,
    gameId: row.game_id,
    clanId: row.clan_id ?? null,
    metadata: row.metadata ?? {},
});
const mapMessageRow = (row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id ?? null,
    body: row.body,
    jsonMetadata: row.json_metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
    editedAt: row.edited_at ?? null,
    shadowMuted: row.shadow_muted ?? false,
});
const getConversationMemberRoles = async (conversationId) => {
    const result = await query(`
    SELECT cm.user_id, cm.role, cm.joined_at, cm.shadow_muted, u.username
    FROM conversation_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = $1
    ORDER BY cm.joined_at ASC
  `, [conversationId]);
    return result.rows.map((row) => ({
        userId: row.user_id,
        role: row.role,
        joinedAt: row.joined_at,
        shadowMuted: row.shadow_muted ?? false,
        username: row.username,
    }));
};
const getConversationMemberRolesBulk = async (conversationIds) => {
    const uniqueIds = Array.from(new Set(conversationIds)).filter(Boolean);
    const memberMap = new Map();
    if (uniqueIds.length === 0) {
        return memberMap;
    }
    for (const id of uniqueIds) {
        memberMap.set(id, []);
    }
    const result = await query(`
    SELECT
      cm.conversation_id,
      cm.user_id,
      cm.role,
      cm.joined_at,
      cm.shadow_muted,
      u.username
    FROM conversation_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = ANY($1::uuid[])
    ORDER BY cm.conversation_id ASC, cm.joined_at ASC
  `, [uniqueIds]);
    for (const row of result.rows) {
        const roles = memberMap.get(row.conversation_id);
        const memberRole = {
            userId: row.user_id,
            role: row.role,
            joinedAt: row.joined_at,
            shadowMuted: row.shadow_muted ?? false,
            username: row.username,
        };
        if (roles) {
            roles.push(memberRole);
        }
        else {
            memberMap.set(row.conversation_id, [memberRole]);
        }
    }
    return memberMap;
};
const buildConversationDescriptor = async (conversation, memberRolesOverride) => {
    const memberRoles = memberRolesOverride ?? (await getConversationMemberRoles(conversation.id));
    const memberIds = memberRoles.map((member) => member.userId);
    return {
        ...conversation,
        memberIds,
        memberRoles,
    };
};
const handlePolicyError = (error) => {
    if (error instanceof MessagingPolicyError) {
        throw new ConversationError(error.code, error.message);
    }
    throw error;
};
const getDirectConversation = async (userA, userB) => {
    const result = await query(`
    SELECT ${CONVERSATION_COLUMNS}
    FROM conversations c
    WHERE c.kind = 'direct'
      AND EXISTS (
        SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = $1
      )
      AND EXISTS (
        SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = $2
      )
    LIMIT 1
  `, [userA, userB]);
    if (result.rows.length === 0) {
        return null;
    }
    const conversation = mapConversationRow(result.rows[0]);
    return buildConversationDescriptor(conversation);
};
const insertConversationMember = async (client, conversationId, userId, role) => {
    await client.query(`
    INSERT INTO conversation_members (conversation_id, user_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (conversation_id, user_id) DO NOTHING
  `, [conversationId, userId, role]);
};
const syncConversationMembers = async (conversationId, desiredUserIds, ownerUserId) => {
    const uniqueDesired = Array.from(new Set(desiredUserIds.filter((id) => typeof id === 'string')));
    const desiredSet = new Set(uniqueDesired);
    const existingResult = await query(`
    SELECT user_id, role
    FROM conversation_members
    WHERE conversation_id = $1
  `, [conversationId]);
    const existingMembers = existingResult.rows;
    const existingSet = new Set(existingMembers.map((member) => member.user_id));
    const toAdd = uniqueDesired.filter((userId) => !existingSet.has(userId));
    const toRemove = existingMembers
        .filter((member) => !desiredSet.has(member.user_id) &&
        member.role !== 'owner' &&
        member.user_id !== ownerUserId)
        .map((member) => member.user_id);
    if (toAdd.length === 0 && toRemove.length === 0) {
        return { added: [], removed: [] };
    }
    await transaction(async (client) => {
        for (const userId of toAdd) {
            await insertConversationMember(client, conversationId, userId, 'member');
        }
        if (toRemove.length > 0) {
            await client.query(`
        DELETE FROM conversation_members
        WHERE conversation_id = $1 AND user_id = ANY($2::uuid[])
      `, [conversationId, toRemove]);
        }
        if (toAdd.length > 0 || toRemove.length > 0) {
            await client.query(`
        UPDATE conversations
        SET updated_at = NOW()
        WHERE id = $1
      `, [conversationId]);
        }
    });
    return { added: toAdd, removed: toRemove };
};
export async function ensureDirectConversation(initiatorId, targetUserId) {
    try {
        await assertCanStartDirectConversation(initiatorId, targetUserId);
    }
    catch (error) {
        if (error instanceof MessagingPolicyError) {
            throw new ConversationError(error.code, error.message);
        }
        throw error;
    }
    const existing = await getDirectConversation(initiatorId, targetUserId);
    if (existing) {
        return existing;
    }
    try {
        const conversationRecord = await transaction(async (client) => {
            const conversationResult = await client.query(`
        INSERT INTO conversations (kind, created_by, metadata)
        VALUES ('direct', $1, '{}'::jsonb)
        RETURNING ${CONVERSATION_COLUMNS}
      `, [initiatorId]);
            const row = conversationResult.rows[0];
            const conversationId = row.id;
            await insertConversationMember(client, conversationId, initiatorId, 'owner');
            await insertConversationMember(client, conversationId, targetUserId, 'member');
            return mapConversationRow(row);
        });
        return buildConversationDescriptor(conversationRecord);
    }
    catch (error) {
        logger.error('Failed to create direct conversation', { initiatorId, targetUserId, error });
        throw error;
    }
}
const normalizeGroupTitle = (title) => {
    if (!title)
        return null;
    const trimmed = title.trim();
    if (trimmed.length === 0)
        return null;
    if (trimmed.length > 120) {
        throw new ConversationError('INVALID_TITLE', 'Group titles must be 120 characters or fewer');
    }
    return trimmed;
};
const normalizeMetadata = (metadata) => {
    if (!metadata) {
        return '{}';
    }
    try {
        return JSON.stringify(metadata);
    }
    catch (_error) {
        throw new ConversationError('INVALID_METADATA', 'Conversation metadata must be JSON serializable');
    }
};
export async function createGroupConversation(options) {
    const { creatorId } = options;
    const title = normalizeGroupTitle(options.title);
    const uniqueMembers = new Set([creatorId]);
    for (const candidate of options.memberIds ?? []) {
        if (typeof candidate === 'string' && candidate && candidate !== creatorId) {
            uniqueMembers.add(candidate);
        }
    }
    if (uniqueMembers.size < 2) {
        throw new ConversationError('NOT_ENOUGH_MEMBERS', 'Group conversations require at least two members');
    }
    if (uniqueMembers.size > MAX_GROUP_MEMBERS) {
        throw new ConversationError('GROUP_LIMIT', `Group conversations are limited to ${MAX_GROUP_MEMBERS} members`);
    }
    const invitees = Array.from(uniqueMembers).filter((userId) => userId !== creatorId);
    for (const invitee of invitees) {
        try {
            await assertCanInviteToGroup(creatorId, invitee);
        }
        catch (error) {
            handlePolicyError(error);
        }
    }
    const metadataJson = normalizeMetadata(options.metadata);
    const conversationRecord = await transaction(async (client) => {
        const conversationResult = await client.query(`
      INSERT INTO conversations (kind, title, created_by, metadata)
      VALUES ('group', $1, $2, $3::jsonb)
      RETURNING ${CONVERSATION_COLUMNS}
    `, [title, creatorId, metadataJson]);
        const row = conversationResult.rows[0];
        const conversationId = row.id;
        await insertConversationMember(client, conversationId, creatorId, 'owner');
        for (const memberId of invitees) {
            await insertConversationMember(client, conversationId, memberId, 'member');
        }
        return mapConversationRow(row);
    });
    const descriptor = await buildConversationDescriptor(conversationRecord);
    emitConversationCreatedEvent(descriptor);
    return descriptor;
}
export async function addMembersToConversation(options) {
    const { actorId, conversationId } = options;
    const requestedIds = Array.from(new Set((options.memberIds ?? []).filter((id) => typeof id === 'string' && id && id !== actorId)));
    if (requestedIds.length === 0) {
        return [];
    }
    const conversation = await getConversationRow(conversationId);
    if (conversation.kind !== 'group') {
        throw new ConversationError('INVALID_OPERATION', 'Members can only be added to group conversations');
    }
    const actorMembership = await ensureMembership(conversationId, actorId);
    if (actorMembership.role !== 'owner' && actorMembership.role !== 'admin') {
        throw new ConversationError('FORBIDDEN', 'You do not have permission to manage members');
    }
    const existingMembers = await getConversationMemberRoles(conversationId);
    const existingSet = new Set(existingMembers.map((member) => member.userId));
    const newMembers = requestedIds.filter((userId) => !existingSet.has(userId));
    if (newMembers.length === 0) {
        return [];
    }
    if (existingMembers.length + newMembers.length > MAX_GROUP_MEMBERS) {
        throw new ConversationError('GROUP_LIMIT', `Group conversations are limited to ${MAX_GROUP_MEMBERS} members`);
    }
    for (const userId of newMembers) {
        try {
            await assertCanInviteToGroup(actorId, userId);
        }
        catch (error) {
            handlePolicyError(error);
        }
    }
    await transaction(async (client) => {
        for (const userId of newMembers) {
            await insertConversationMember(client, conversationId, userId, 'member');
        }
    });
    const refreshedConversation = await getConversationRow(conversationId);
    const descriptor = await buildConversationDescriptor(refreshedConversation);
    const addedMemberRoles = descriptor.memberRoles.filter((member) => newMembers.includes(member.userId));
    emitConversationCreatedEvent(descriptor, newMembers);
    emitConversationMembersAddedEvent(conversationId, addedMemberRoles, descriptor.memberIds);
    return addedMemberRoles;
}
export async function ensureGameConversation(gameId) {
    const { hostId, name, roomId } = await getGameRoomHost(gameId);
    const existingResult = await query(`
    SELECT ${CONVERSATION_COLUMNS}
    FROM conversations
    WHERE kind = 'game' AND game_id = $1
    LIMIT 1
  `, [roomId]);
    let conversationRecord;
    if (existingResult.rows.length === 0) {
        const title = name ? `${name} (Game Chat)` : null;
        const metadata = JSON.stringify({ gameId: roomId });
        conversationRecord = await transaction(async (client) => {
            const conversationInsert = await client.query(`
        INSERT INTO conversations (kind, title, created_by, metadata, game_id)
        VALUES ('game', $1, $2, $3::jsonb, $4)
        RETURNING ${CONVERSATION_COLUMNS}
      `, [title, hostId, metadata, roomId]);
            const row = conversationInsert.rows[0];
            await insertConversationMember(client, row.id, hostId, 'owner');
            return mapConversationRow(row);
        });
    }
    else {
        conversationRecord = mapConversationRow(existingResult.rows[0]);
    }
    const playerRows = await getActiveRoomPlayers(roomId);
    const desiredMembers = new Set(playerRows.map((row) => row.user_id));
    desiredMembers.add(hostId);
    const { added, removed } = await syncConversationMembers(conversationRecord.id, Array.from(desiredMembers), hostId);
    const descriptor = await buildConversationDescriptor(conversationRecord);
    if (added.length > 0) {
        const addedRoles = descriptor.memberRoles.filter((member) => added.includes(member.userId));
        emitConversationMembersAddedEvent(conversationRecord.id, addedRoles, descriptor.memberIds);
    }
    if (removed.length > 0) {
        emitConversationMembersRemovedEvent(conversationRecord.id, removed, descriptor.memberIds);
    }
    emitConversationUpdatedEvent(descriptor);
    return descriptor;
}
export async function ensureClanConversation(clanId) {
    const clanResult = await query(`SELECT id, owner_user_id, name FROM clans WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [clanId]);
    const clan = clanResult.rows[0];
    if (!clan) {
        throw new ConversationError('NOT_FOUND', 'Clan not found');
    }
    const existing = await query(`SELECT ${CONVERSATION_COLUMNS}, clan_id FROM conversations WHERE clan_id = $1 LIMIT 1`, [clanId]);
    let conversationRecord;
    if (existing.rows.length === 0) {
        const title = `${clan.name} — Clan Chat`;
        const metadata = JSON.stringify({ clanId });
        conversationRecord = await transaction(async (client) => {
            const insert = await client.query(`
          INSERT INTO conversations (kind, title, created_by, metadata, clan_id)
          VALUES ('group', $1, $2, $3::jsonb, $4)
          RETURNING ${CONVERSATION_COLUMNS}, clan_id
        `, [title, clan.owner_user_id, metadata, clan.id]);
            const row = insert.rows[0];
            await insertConversationMember(client, row.id, clan.owner_user_id, 'owner');
            return mapConversationRow(row);
        });
    }
    else {
        conversationRecord = mapConversationRow(existing.rows[0]);
    }
    const members = await query(`SELECT user_id FROM clan_members WHERE clan_id = $1 AND status = 'active'`, [clanId]);
    const desired = new Set(members.rows.map((r) => r.user_id));
    desired.add(clan.owner_user_id);
    const { added, removed } = await syncConversationMembers(conversationRecord.id, Array.from(desired), clan.owner_user_id);
    const descriptor = await buildConversationDescriptor(conversationRecord);
    if (added.length > 0) {
        const addedRoles = descriptor.memberRoles.filter((m) => added.includes(m.userId));
        emitConversationMembersAddedEvent(conversationRecord.id, addedRoles, descriptor.memberIds);
    }
    if (removed.length > 0) {
        emitConversationMembersRemovedEvent(conversationRecord.id, removed, descriptor.memberIds);
    }
    emitConversationUpdatedEvent(descriptor);
    return descriptor;
}
export async function ensureTeamConversation(gameId, teamId) {
    const { hostId, name, roomId } = await getGameRoomHost(gameId);
    const existingResult = await query(`
    SELECT ${CONVERSATION_COLUMNS}
    FROM conversations
    WHERE kind = 'team'
      AND game_id = $1
      AND metadata ->> 'teamId' = $2
    LIMIT 1
  `, [roomId, String(teamId)]);
    let conversationRecord;
    if (existingResult.rows.length === 0) {
        const title = name ? `${name} — Team ${teamId}` : `Team ${teamId}`;
        const metadata = JSON.stringify({ gameId: roomId, teamId });
        conversationRecord = await transaction(async (client) => {
            const conversationInsert = await client.query(`
        INSERT INTO conversations (kind, title, created_by, metadata, game_id)
        VALUES ('team', $1, $2, $3::jsonb, $4)
        RETURNING ${CONVERSATION_COLUMNS}
      `, [title, hostId, metadata, roomId]);
            const row = conversationInsert.rows[0];
            await insertConversationMember(client, row.id, hostId, 'owner');
            return mapConversationRow(row);
        });
    }
    else {
        conversationRecord = mapConversationRow(existingResult.rows[0]);
    }
    const playerRows = await getActiveRoomPlayers(roomId);
    const desiredMembers = playerRows
        .filter((row) => row.team_id === teamId)
        .map((row) => row.user_id);
    desiredMembers.push(hostId);
    const { added, removed } = await syncConversationMembers(conversationRecord.id, desiredMembers, hostId);
    const descriptor = await buildConversationDescriptor(conversationRecord);
    if (added.length > 0) {
        const addedRoles = descriptor.memberRoles.filter((member) => added.includes(member.userId));
        emitConversationMembersAddedEvent(conversationRecord.id, addedRoles, descriptor.memberIds);
    }
    if (removed.length > 0) {
        emitConversationMembersRemovedEvent(conversationRecord.id, removed, descriptor.memberIds);
    }
    emitConversationUpdatedEvent(descriptor);
    return descriptor;
}
export async function leaveConversation(conversationId, userId) {
    const conversation = await getConversationRow(conversationId);
    if (conversation.kind !== 'group') {
        throw new ConversationError('INVALID_OPERATION', 'Leave is only supported for group conversations');
    }
    await transaction(async (client) => {
        const membershipResult = await client.query(`
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `, [conversationId, userId]);
        if (membershipResult.rows.length === 0) {
            throw new ConversationError('NOT_MEMBER', 'User is not a member of this conversation');
        }
        const membership = membershipResult.rows[0];
        const othersResult = await client.query(`
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id <> $2
      ORDER BY role = 'admin' DESC, joined_at ASC
      FOR UPDATE
    `, [conversationId, userId]);
        if (membership.role === 'owner' && othersResult.rows.length > 0) {
            const nextOwner = othersResult.rows[0];
            await client.query(`
        UPDATE conversation_members
        SET role = 'owner', updated_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2
      `, [conversationId, nextOwner.user_id]);
        }
        await client.query(`
      DELETE FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
    `, [conversationId, userId]);
        if (membership.role === 'owner' && othersResult.rows.length === 0) {
            await client.query(`
        UPDATE conversations
        SET is_archived = TRUE, updated_at = NOW()
        WHERE id = $1
      `, [conversationId]);
        }
        else {
            await client.query(`
        UPDATE conversations
        SET updated_at = NOW()
        WHERE id = $1
      `, [conversationId]);
        }
    });
    const descriptor = await buildConversationDescriptor(await getConversationRow(conversationId));
    emitConversationMembersRemovedEvent(conversationId, [userId], descriptor.memberIds);
}
export async function removeConversationMember(options) {
    const { actorId, conversationId, targetUserId } = options;
    if (actorId === targetUserId) {
        throw new ConversationError('INVALID_OPERATION', 'Use the leave endpoint to remove yourself');
    }
    const conversation = await getConversationRow(conversationId);
    if (conversation.kind !== 'group') {
        throw new ConversationError('INVALID_OPERATION', 'Remove member is only supported for group conversations');
    }
    await transaction(async (client) => {
        const actorResult = await client.query(`
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `, [conversationId, actorId]);
        if (actorResult.rows.length === 0) {
            throw new ConversationError('NOT_MEMBER', 'You are not a member of this conversation');
        }
        const actor = actorResult.rows[0];
        if (actor.role !== 'owner' && actor.role !== 'admin') {
            throw new ConversationError('FORBIDDEN', 'You do not have permission to remove members');
        }
        const targetResult = await client.query(`
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `, [conversationId, targetUserId]);
        if (targetResult.rows.length === 0) {
            throw new ConversationError('NOT_MEMBER', 'Target user is not part of this conversation');
        }
        const target = targetResult.rows[0];
        if (target.role === 'owner') {
            throw new ConversationError('FORBIDDEN', 'Cannot remove the conversation owner');
        }
        await client.query(`
      DELETE FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
    `, [conversationId, targetUserId]);
        await client.query(`
      UPDATE conversations
      SET updated_at = NOW()
      WHERE id = $1
    `, [conversationId]);
    });
    const descriptor = await buildConversationDescriptor(await getConversationRow(conversationId));
    emitConversationMembersRemovedEvent(conversationId, [targetUserId], descriptor.memberIds);
}
export async function updateConversationMemberRole(options) {
    const { actorId, conversationId, targetUserId, role } = options;
    if (role !== 'admin' && role !== 'member') {
        throw new ConversationError('INVALID_ROLE', 'Only admin and member roles are supported');
    }
    await transaction(async (client) => {
        const conversationResult = await client.query(`
      SELECT ${CONVERSATION_COLUMNS}
      FROM conversations
      WHERE id = $1
      FOR UPDATE
    `, [conversationId]);
        if (conversationResult.rows.length === 0) {
            throw new ConversationError('NOT_FOUND', 'Conversation not found');
        }
        const conversationRow = conversationResult.rows[0];
        if (conversationRow.kind !== 'group') {
            throw new ConversationError('INVALID_OPERATION', 'Role updates are only supported for group conversations');
        }
        const actorResult = await client.query(`
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `, [conversationId, actorId]);
        if (actorResult.rows.length === 0) {
            throw new ConversationError('NOT_MEMBER', 'You are not a member of this conversation');
        }
        const actorRole = actorResult.rows[0].role;
        if (actorRole !== 'owner' && actorRole !== 'admin') {
            throw new ConversationError('FORBIDDEN', 'You do not have permission to change roles');
        }
        const targetResult = await client.query(`
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `, [conversationId, targetUserId]);
        if (targetResult.rows.length === 0) {
            throw new ConversationError('NOT_MEMBER', 'Target user is not part of this conversation');
        }
        const target = targetResult.rows[0];
        if (target.role === 'owner') {
            throw new ConversationError('FORBIDDEN', 'Cannot change the conversation owner role');
        }
        if (actorRole === 'admin' && target.role !== 'member') {
            throw new ConversationError('FORBIDDEN', 'Admins can only manage member roles');
        }
        if (target.role === role) {
            return;
        }
        await client.query(`
      UPDATE conversation_members
      SET role = $3, updated_at = NOW()
      WHERE conversation_id = $1 AND user_id = $2
    `, [conversationId, targetUserId, role]);
        await client.query(`
      UPDATE conversations
      SET updated_at = NOW()
      WHERE id = $1
    `, [conversationId]);
    });
    const descriptor = await buildConversationDescriptor(await getConversationRow(conversationId));
    const updatedMember = descriptor.memberRoles.find((member) => member.userId === targetUserId);
    if (!updatedMember) {
        throw new ConversationError('NOT_MEMBER', 'Target user is not part of this conversation');
    }
    emitConversationMembersChangedEvent(conversationId, [updatedMember], descriptor.memberIds);
    return updatedMember;
}
export async function setConversationArchived(options) {
    const { actorId, conversationId, archived } = options;
    let changed = false;
    await transaction(async (client) => {
        const conversationResult = await client.query(`
      SELECT ${CONVERSATION_COLUMNS}
      FROM conversations
      WHERE id = $1
      FOR UPDATE
    `, [conversationId]);
        if (conversationResult.rows.length === 0) {
            throw new ConversationError('NOT_FOUND', 'Conversation not found');
        }
        const conversationRow = conversationResult.rows[0];
        if (conversationRow.kind !== 'group') {
            throw new ConversationError('INVALID_OPERATION', 'Archiving is only supported for group conversations');
        }
        const actorResult = await client.query(`
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `, [conversationId, actorId]);
        if (actorResult.rows.length === 0) {
            throw new ConversationError('NOT_MEMBER', 'You are not a member of this conversation');
        }
        const actorRole = actorResult.rows[0].role;
        if (actorRole !== 'owner' && actorRole !== 'admin') {
            throw new ConversationError('FORBIDDEN', 'You do not have permission to archive this conversation');
        }
        if (conversationRow.is_archived === archived) {
            return;
        }
        await client.query(`
      UPDATE conversations
      SET is_archived = $2, updated_at = NOW()
      WHERE id = $1
    `, [conversationId, archived]);
        changed = true;
    });
    const descriptor = await buildConversationDescriptor(await getConversationRow(conversationId));
    if (changed) {
        emitConversationUpdatedEvent(descriptor);
    }
    return descriptor;
}
const ensureMembership = async (conversationId, userId) => {
    const membershipResult = await query(`
    SELECT user_id, role, joined_at, shadow_muted
    FROM conversation_members
    WHERE conversation_id = $1 AND user_id = $2
  `, [conversationId, userId]);
    if (membershipResult.rows.length === 0) {
        throw new ConversationError('NOT_MEMBER', 'User is not a member of this conversation');
    }
    const row = membershipResult.rows[0];
    return { role: row.role, shadowMuted: row.shadow_muted ?? false, joinedAt: row.joined_at };
};
const getConversationRow = async (conversationId) => {
    const result = await query(`SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE id = $1`, [conversationId]);
    if (result.rows.length === 0) {
        throw new ConversationError('NOT_FOUND', 'Conversation not found');
    }
    return mapConversationRow(result.rows[0]);
};
const resolveConversationAccess = async (conversationId, userId, options = {}) => {
    const conversation = await getConversationRow(conversationId);
    const membershipResult = await query(`
    SELECT role, shadow_muted, joined_at, is_muted, is_pinned, last_read_message_id, last_read_at
    FROM conversation_members
    WHERE conversation_id = $1 AND user_id = $2
  `, [conversationId, userId]);
    if (membershipResult.rows.length > 0) {
        return {
            conversation,
            membership: membershipResult.rows[0],
            accessLevel: 'member',
        };
    }
    if (options.allowSpectatorGameAccess && conversation.kind === 'game') {
        if (!conversation.gameId) {
            throw new ConversationError('NOT_FOUND', 'Game conversation not linked to a room');
        }
        const privacyResult = await query('SELECT is_private FROM game_rooms WHERE id = $1', [conversation.gameId]);
        const isPrivate = privacyResult.rows[0]?.is_private ?? true;
        if (!isPrivate) {
            return {
                conversation,
                membership: undefined,
                accessLevel: 'spectator',
            };
        }
    }
    throw new ConversationError('NOT_MEMBER', 'User is not a member of this conversation');
};
const getOtherDirectMember = async (conversationId, senderId) => {
    const result = await query(`
    SELECT user_id
    FROM conversation_members
    WHERE conversation_id = $1 AND user_id <> $2
    LIMIT 1
  `, [conversationId, senderId]);
    if (result.rows.length === 0) {
        return null;
    }
    return result.rows[0].user_id;
};
const getGameRoomHost = async (gameIdentifier) => {
    const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const isNumeric = (value) => /^[0-9]+$/.test(value);
    let row;
    if (isUUID(gameIdentifier)) {
        const result = await query(`
      SELECT id, host_id, name
      FROM game_rooms
      WHERE id = $1::uuid
    `, [gameIdentifier]);
        if (result.rows.length === 0) {
            throw new ConversationError('NOT_FOUND', 'Game room not found');
        }
        row = result.rows[0];
    }
    else if (isNumeric(gameIdentifier)) {
        const result = await query(`
      SELECT id, host_id, name
      FROM game_rooms
      WHERE room_code = $1::bigint
    `, [gameIdentifier]);
        if (result.rows.length === 0) {
            throw new ConversationError('NOT_FOUND', 'Game room not found');
        }
        row = result.rows[0];
    }
    else {
        throw new ConversationError('INVALID_TARGET', 'Invalid game identifier');
    }
    return { hostId: row.host_id, name: row.name, roomId: row.id };
};
const getActiveRoomPlayers = async (gameId) => {
    const result = await query(`
    SELECT user_id, team_id
    FROM room_players
    WHERE room_id = $1 AND (left_at IS NULL)
  `, [gameId]);
    return result.rows;
};
const toIsoString = (value) => value instanceof Date ? value.toISOString() : value;
const serializeConversationForEvent = (conversation) => ({
    id: conversation.id,
    kind: conversation.kind,
    title: conversation.title,
    createdBy: conversation.createdBy,
    createdAt: toIsoString(conversation.createdAt),
    updatedAt: toIsoString(conversation.updatedAt),
    isArchived: conversation.isArchived,
    isReadOnly: conversation.isReadOnly,
    gameId: conversation.gameId,
    metadata: conversation.metadata,
    memberIds: conversation.memberIds,
});
const emitConversationCreatedEvent = (conversation, recipients) => {
    try {
        const io = tryGetSocketServer();
        if (!io) {
            return;
        }
        const payload = {
            conversation: serializeConversationForEvent(conversation),
            members: conversation.memberRoles.map(({ userId, role, username }) => ({
                userId,
                role,
                username,
            })),
        };
        const targetUserIds = recipients ?? conversation.memberIds;
        for (const userId of targetUserIds) {
            io.to(`user:${userId}`).emit('conversation.created', payload);
        }
    }
    catch (error) {
        logger.warn('Failed to emit conversation.created event', {
            conversationId: conversation.id,
            error,
        });
    }
};
const emitConversationMembersAddedEvent = (conversationId, addedMembers, recipients) => {
    if (addedMembers.length === 0) {
        return;
    }
    try {
        const io = tryGetSocketServer();
        if (!io) {
            return;
        }
        const payload = {
            conversationId,
            members: addedMembers.map(({ userId, role, username }) => ({ userId, role, username })),
        };
        for (const userId of recipients) {
            io.to(`user:${userId}`).emit('conversation.members.added', payload);
        }
    }
    catch (error) {
        logger.warn('Failed to emit conversation.members.added event', {
            conversationId,
            error,
        });
    }
};
const emitConversationMembersRemovedEvent = (conversationId, removedUserIds, recipients) => {
    if (removedUserIds.length === 0) {
        return;
    }
    try {
        const io = tryGetSocketServer();
        if (!io) {
            return;
        }
        const payload = {
            conversationId,
            members: removedUserIds.map((userId) => ({ userId })),
        };
        for (const userId of recipients) {
            io.to(`user:${userId}`).emit('conversation.members.removed', payload);
        }
    }
    catch (error) {
        logger.warn('Failed to emit conversation.members.removed event', {
            conversationId,
            error,
        });
    }
};
const emitConversationMembersChangedEvent = (conversationId, members, recipients) => {
    if (members.length === 0) {
        return;
    }
    try {
        const io = tryGetSocketServer();
        if (!io) {
            return;
        }
        const payload = {
            conversationId,
            members: members.map(({ userId, role }) => ({ userId, role })),
        };
        io.to(`conversation:${conversationId}`).emit('conversation.members.changed', payload);
        for (const userId of recipients) {
            io.to(`user:${userId}`).emit('conversation.members.changed', payload);
        }
    }
    catch (error) {
        logger.warn('Failed to emit conversation.members.changed event', {
            conversationId,
            error,
        });
    }
};
const emitConversationMessageEvent = (descriptor, message) => {
    try {
        const io = tryGetSocketServer();
        if (!io) {
            return;
        }
        const payload = {
            conversationId: descriptor.id,
            id: message.id,
            senderId: message.senderId,
            body: message.body,
            createdAt: toIsoString(message.createdAt),
            metadata: message.jsonMetadata ?? {},
        };
        io.to(`conversation:${descriptor.id}`).emit('conversation.message.new', payload);
        io.to(`conversation:${descriptor.id}`).emit('message.new', payload);
        for (const userId of descriptor.memberIds) {
            io.to(`user:${userId}`).emit('conversation.message.new', payload);
            io.to(`user:${userId}`).emit('message.new', payload);
        }
    }
    catch (error) {
        logger.warn('Failed to emit conversation.message.new event', {
            conversationId: descriptor.id,
            error,
        });
    }
};
const emitConversationUpdatedEvent = (conversation) => {
    try {
        const io = tryGetSocketServer();
        if (!io) {
            return;
        }
        const payload = {
            conversation: serializeConversationForEvent(conversation),
        };
        io.to(`conversation:${conversation.id}`).emit('conversation.updated', payload);
        for (const userId of conversation.memberIds) {
            io.to(`user:${userId}`).emit('conversation.updated', payload);
        }
    }
    catch (error) {
        logger.warn('Failed to emit conversation.updated event', {
            conversationId: conversation.id,
            error,
        });
    }
};
export async function sendMessage(options) {
    const { conversationId, senderId, body, clientMessageId, metadata } = options;
    const trimmed = body?.trim();
    if (!trimmed) {
        throw new ConversationError('EMPTY_MESSAGE', 'Message body is required');
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
        throw new ConversationError('MESSAGE_TOO_LONG', 'Message exceeds the allowed length');
    }
    const access = await resolveConversationAccess(conversationId, senderId, {
        allowSpectatorGameAccess: true,
    });
    const conversation = access.conversation;
    if (conversation.kind === 'direct') {
        const otherMember = await getOtherDirectMember(conversationId, senderId);
        if (otherMember) {
            try {
                await assertCanSendDirectMessage(senderId, otherMember);
            }
            catch (error) {
                if (error instanceof MessagingPolicyError) {
                    throw new ConversationError(error.code, error.message);
                }
                throw error;
            }
        }
    }
    const descriptor = await buildConversationDescriptor(conversation);
    if (clientMessageId) {
        const existing = await query(`
      SELECT *
      FROM conversation_messages
      WHERE conversation_id = $1
        AND sender_id = $2
        AND json_metadata ->> 'clientMessageId' = $3
      LIMIT 1
    `, [conversationId, senderId, clientMessageId]);
        if (existing.rows.length > 0) {
            return mapMessageRow(existing.rows[0]);
        }
    }
    let senderName;
    if (senderId) {
        const senderResult = await query(`SELECT username FROM users WHERE id = $1`, [senderId]);
        senderName = senderResult.rows[0]?.username;
    }
    const jsonMetadata = {
        ...(metadata ?? {}),
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(senderName ? { senderName } : {}),
        ...(access.accessLevel === 'spectator' ? { senderRole: 'spectator' } : {}),
    };
    const insertResult = await query(`
    INSERT INTO conversation_messages (conversation_id, sender_id, body, json_metadata)
    VALUES ($1, $2, $3, $4::jsonb)
    RETURNING *
  `, [conversationId, senderId, trimmed, JSON.stringify(jsonMetadata)]);
    const message = mapMessageRow(insertResult.rows[0]);
    if (access.accessLevel === 'member') {
        await query(`
      UPDATE conversation_members
      SET last_read_message_id = $1,
          last_read_at = NOW()
      WHERE conversation_id = $2 AND user_id = $3
    `, [message.id, conversationId, senderId]);
    }
    emitConversationMessageEvent(descriptor, message);
    return message;
}
export async function listMessages(conversationId, userId, limit = 50, before) {
    if (limit <= 0 || limit > 100) {
        throw new ConversationError('INVALID_PAGINATION', 'Limit must be between 1 and 100');
    }
    await resolveConversationAccess(conversationId, userId, {
        allowSpectatorGameAccess: true,
    });
    const params = [conversationId];
    let cursorClause = '';
    if (before) {
        params.push(before);
        cursorClause = 'AND id < $2';
    }
    params.push(limit);
    const result = await query(`
    SELECT *
    FROM conversation_messages
    WHERE conversation_id = $1
      ${cursorClause}
    ORDER BY created_at DESC
    LIMIT $${params.length}
  `, params);
    return result.rows.map(mapMessageRow);
}
export async function markConversationRead(conversationId, userId) {
    const access = await resolveConversationAccess(conversationId, userId, {
        allowSpectatorGameAccess: true,
    });
    if (access.accessLevel !== 'member') {
        return;
    }
    const latestResult = await query(`
    SELECT id, created_at
    FROM conversation_messages
    WHERE conversation_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `, [conversationId]);
    const latestMessage = latestResult.rows[0] ?? null;
    const lastReadId = latestMessage?.id ?? null;
    const lastReadAt = latestMessage?.created_at ?? new Date();
    await query(`
    UPDATE conversation_members
    SET
      last_read_message_id = $3,
      last_read_at = $4,
      updated_at = NOW()
    WHERE conversation_id = $1 AND user_id = $2
  `, [conversationId, userId, lastReadId, lastReadAt]);
}
export async function getConversationDetail(conversationId, userId, options = {}) {
    const access = await resolveConversationAccess(conversationId, userId, options);
    const descriptor = await buildConversationDescriptor(access.conversation);
    if (access.accessLevel === 'spectator') {
        const membership = {
            role: 'member',
            joinedAt: new Date(),
            isMuted: false,
            isPinned: false,
            shadowMuted: false,
            lastReadMessageId: null,
            lastReadAt: null,
            accessLevel: 'spectator',
        };
        return {
            conversation: descriptor,
            membership,
            unreadCount: 0,
        };
    }
    if (!access.membership) {
        throw new ConversationError('NOT_MEMBER', 'User is not a member of this conversation');
    }
    const membershipRow = access.membership;
    const unreadResult = await query(`
    SELECT COUNT(*)::INT AS count
    FROM conversation_messages
    WHERE conversation_id = $1
      AND ($2::TIMESTAMPTZ IS NULL OR created_at > $2)
  `, [conversationId, membershipRow.last_read_at]);
    const membership = {
        role: membershipRow.role,
        joinedAt: membershipRow.joined_at,
        isMuted: membershipRow.is_muted ?? false,
        isPinned: membershipRow.is_pinned ?? false,
        shadowMuted: membershipRow.shadow_muted ?? false,
        lastReadMessageId: membershipRow.last_read_message_id ?? null,
        lastReadAt: membershipRow.last_read_at ?? null,
        accessLevel: 'member',
    };
    return {
        conversation: descriptor,
        membership,
        unreadCount: unreadResult.rows[0]?.count ?? 0,
    };
}
export async function getUnreadSummary(userId) {
    const result = await query(`
    SELECT
      cm.conversation_id,
      COALESCE(unread.unread_count, 0) AS unread_count
    FROM conversation_members cm
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INT AS unread_count
      FROM conversation_messages m
      WHERE m.conversation_id = cm.conversation_id
        AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
    ) unread ON TRUE
    WHERE cm.user_id = $1
  `, [userId]);
    return result.rows.map((row) => ({
        conversationId: row.conversation_id,
        unreadCount: Number(row.unread_count ?? 0),
    }));
}
export async function listConversationsForUser(userId, options = {}) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const result = await query(`
    SELECT
      c.id,
      c.kind,
      c.title,
      c.created_by,
      c.created_at,
      c.updated_at,
      c.is_archived,
      c.is_read_only,
      c.game_id,
      c.metadata,
      cm.role AS member_role,
      cm.joined_at,
      cm.is_muted,
      cm.is_pinned,
      cm.shadow_muted,
      cm.last_read_message_id,
      cm.last_read_at,
      COALESCE(unread.unread_count, 0) AS unread_count,
      last_message.id AS last_message_id,
      last_message.body AS last_message_body,
      last_message.created_at AS last_message_created_at,
      last_message.sender_id AS last_message_sender_id,
      last_message.json_metadata AS last_message_metadata
    FROM conversation_members cm
    JOIN conversations c ON c.id = cm.conversation_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INT AS unread_count
      FROM conversation_messages m
      WHERE m.conversation_id = cm.conversation_id
        AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
    ) unread ON TRUE
    LEFT JOIN LATERAL (
      SELECT m.id, m.body, m.created_at, m.sender_id, m.json_metadata
      FROM conversation_messages m
      WHERE m.conversation_id = cm.conversation_id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) last_message ON TRUE
    WHERE cm.user_id = $1
    ORDER BY c.updated_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);
    const entries = [];
    const memberRolesByConversation = await getConversationMemberRolesBulk(result.rows.map((row) => row.id));
    const descriptorCache = new Map();
    for (const row of result.rows) {
        const record = mapConversationRow(row);
        const cached = descriptorCache.get(record.id);
        const descriptor = cached ??
            (await buildConversationDescriptor(record, memberRolesByConversation.get(record.id)));
        if (!cached) {
            descriptorCache.set(record.id, descriptor);
        }
        const membership = {
            role: row.member_role,
            joinedAt: descriptor.memberRoles.find((member) => member.userId === userId)?.joinedAt ??
                row.joined_at,
            isMuted: row.is_muted ?? false,
            isPinned: row.is_pinned ?? false,
            shadowMuted: row.shadow_muted ?? false,
            lastReadMessageId: row.last_read_message_id ?? null,
            lastReadAt: row.last_read_at ?? null,
            accessLevel: 'member',
        };
        const lastMessage = row.last_message_id
            ? {
                id: row.last_message_id,
                body: row.last_message_body ?? '',
                senderId: row.last_message_sender_id ?? null,
                createdAt: row.last_message_created_at ?? new Date(0),
                metadata: row.last_message_metadata ?? {},
            }
            : undefined;
        entries.push({
            conversation: descriptor,
            membership,
            unreadCount: Number(row.unread_count ?? 0),
            lastMessage,
        });
    }
    return entries;
}
export default {
    ensureDirectConversation,
    createGroupConversation,
    addMembersToConversation,
    leaveConversation,
    removeConversationMember,
    updateConversationMemberRole,
    setConversationArchived,
    ensureGameConversation,
    ensureTeamConversation,
    markConversationRead,
    getConversationDetail,
    listConversationsForUser,
    getUnreadSummary,
    sendMessage,
    listMessages,
};
//# sourceMappingURL=conversationService.js.map