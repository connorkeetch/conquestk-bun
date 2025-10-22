/**
 * @fileoverview Service for managing conversations, messages, and members.
 * @module services/conversationService
 */
import type { PoolClient } from 'pg'
import { query, transaction } from '../config/database.js'
import { logger } from '../utils/logger.js'
import {
  assertCanInviteToGroup,
  assertCanSendDirectMessage,
  assertCanStartDirectConversation,
  MessagingPolicyError,
} from './messagingPolicyService.js'
import { tryGetSocketServer } from './socketRegistry.js'

/** Maximum length of a conversation message. */
export const MAX_MESSAGE_LENGTH = 2000
/** Maximum number of members in a group conversation. */
export const MAX_GROUP_MEMBERS = 50

/** Type of conversation. */
export type ConversationKind = 'direct' | 'group' | 'game'

/**
 * @interface ConversationRecord
 * @description Represents a conversation in the database.
 */
export interface ConversationRecord {
  id: string
  kind: ConversationKind
  title: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
  isArchived: boolean
  isReadOnly: boolean
  gameId: string | null
  clanId?: string | null
  metadata: Record<string, unknown>
}

/**
 * @interface ConversationMemberRole
 * @description Represents the role of a member in a conversation.
 */
export interface ConversationMemberRole {
  userId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: Date
  shadowMuted: boolean
  username: string
}

/**
 * @interface ConversationWithMembers
 * @extends ConversationRecord
 * @description Represents a conversation with its members.
 */
export interface ConversationWithMembers extends ConversationRecord {
  memberIds: string[]
  memberRoles: ConversationMemberRole[]
}

/**
 * @interface ConversationMessageRecord
 * @description Represents a message in a conversation.
 */
export interface ConversationMessageRecord {
  id: string
  conversationId: string
  senderId: string | null
  body: string
  jsonMetadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  editedAt: Date | null
  shadowMuted: boolean
}

/**
 * @interface ConversationMessageEventPayload
 * @description Represents the payload for a new message event.
 */
export interface ConversationMessageEventPayload {
  conversationId: string
  id: string
  senderId: string | null
  body: string
  createdAt: string
  metadata: Record<string, unknown>
}

/**
 * @class ConversationError
 * @extends Error
 * @description Custom error class for conversation service operations.
 */
export class ConversationError extends Error {
  code: string

  /**
   * @constructor
   * @param {string} code - The error code.
   * @param {string} message - The error message.
   */
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ConversationError'
    this.code = code
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
`

/** @private */
type ConversationRow = {
  id: string
  kind: ConversationKind
  title: string | null
  created_by: string
  created_at: Date
  updated_at: Date
  is_archived: boolean
  is_read_only: boolean
  game_id: string | null
  clan_id?: string | null
  metadata: Record<string, unknown> | null
}

/** @private */
type ConversationMessageRow = {
  id: string
  conversation_id: string
  sender_id: string | null
  body: string
  json_metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  edited_at: Date | null
  shadow_muted: boolean | null
}

/** @private */
type ConversationMemberRow = {
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: Date
  shadow_muted: boolean | null
}

/** @private */
type ConversationMemberRoleRow = ConversationMemberRow & {
  username: string
}

/** @private */
type ConversationMemberRoleWithConversationRow = ConversationMemberRoleRow & {
  conversation_id: string
}

/** @private */
type ConversationMembershipRow = {
  role: 'owner' | 'admin' | 'member'
  shadow_muted: boolean | null
  joined_at: Date
}

/** @private */
type ConversationMembershipDetailRow = ConversationMembershipRow & {
  is_muted: boolean | null
  is_pinned: boolean | null
  last_read_message_id: string | null
  last_read_at: Date | null
}

/** @private */
type ConversationAccessLevel = 'member' | 'spectator'

/** @private */
interface ResolveConversationAccessOptions {
  allowSpectatorGameAccess?: boolean
}

/** @private */
interface ConversationAccessResult {
  conversation: ConversationRecord
  membership?: ConversationMembershipDetailRow
  accessLevel: ConversationAccessLevel
}

/** @private */
type DirectMemberRow = {
  user_id: string
}

/**
 * Maps a database row to a ConversationRecord object.
 * @param {ConversationRow} row - The database row.
 * @returns {ConversationRecord} The mapped conversation record.
 * @private
 */
const mapConversationRow = (row: ConversationRow): ConversationRecord => ({
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
})

/**
 * Maps a database row to a ConversationMessageRecord object.
 * @param {ConversationMessageRow} row - The database row.
 * @returns {ConversationMessageRecord} The mapped message record.
 * @private
 */
const mapMessageRow = (row: ConversationMessageRow): ConversationMessageRecord => ({
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
})

/**
 * Retrieves the roles of all members in a conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @returns {Promise<ConversationMemberRole[]>} A list of member roles.
 * @private
 */
const getConversationMemberRoles = async (
  conversationId: string,
): Promise<ConversationMemberRole[]> => {
  const result = await query<ConversationMemberRoleRow>(
    `
    SELECT cm.user_id, cm.role, cm.joined_at, cm.shadow_muted, u.username
    FROM conversation_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = $1
    ORDER BY cm.joined_at ASC
  `,
    [conversationId],
  )

  return result.rows.map((row) => ({
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    shadowMuted: row.shadow_muted ?? false,
    username: row.username,
  }))
}

/**
 * Retrieves the member roles for multiple conversations in a single query.
 * @param {string[]} conversationIds - An array of conversation IDs.
 * @returns {Promise<Map<string, ConversationMemberRole[]>>} A map of conversation IDs to their member roles.
 * @private
 */
const getConversationMemberRolesBulk = async (
  conversationIds: string[],
): Promise<Map<string, ConversationMemberRole[]>> => {
  const uniqueIds = Array.from(new Set(conversationIds)).filter(Boolean)

  const memberMap = new Map<string, ConversationMemberRole[]>()

  if (uniqueIds.length === 0) {
    return memberMap
  }

  for (const id of uniqueIds) {
    memberMap.set(id, [])
  }

  const result = await query<ConversationMemberRoleWithConversationRow>(
    `
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
  `,
    [uniqueIds],
  )

  for (const row of result.rows) {
    const roles = memberMap.get(row.conversation_id)
    const memberRole: ConversationMemberRole = {
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
      shadowMuted: row.shadow_muted ?? false,
      username: row.username,
    }

    if (roles) {
      roles.push(memberRole)
    } else {
      memberMap.set(row.conversation_id, [memberRole])
    }
  }

  return memberMap
}

/**
 * Builds a complete conversation descriptor, including member information.
 * @param {ConversationRecord} conversation - The base conversation record.
 * @param {ConversationMemberRole[]} [memberRolesOverride] - Optional override for member roles to avoid an extra query.
 * @returns {Promise<ConversationWithMembers>} The conversation with its members.
 * @private
 */
const buildConversationDescriptor = async (
  conversation: ConversationRecord,
  memberRolesOverride?: ConversationMemberRole[],
): Promise<ConversationWithMembers> => {
  const memberRoles = memberRolesOverride ?? (await getConversationMemberRoles(conversation.id))
  const memberIds = memberRoles.map((member) => member.userId)

  return {
    ...conversation,
    memberIds,
    memberRoles,
  }
}

/**
 * Handles messaging policy errors by re-throwing them as ConversationErrors.
 * @param {unknown} error - The error to handle.
 * @private
 */
const handlePolicyError = (error: unknown): never => {
  if (error instanceof MessagingPolicyError) {
    throw new ConversationError(error.code, error.message)
  }
  throw error
}

/**
 * Retrieves an existing direct conversation between two users.
 * @param {string} userA - The ID of the first user.
 * @param {string} userB - The ID of the second user.
 * @returns {Promise<ConversationWithMembers | null>} The conversation, or null if it doesn't exist.
 * @private
 */
const getDirectConversation = async (
  userA: string,
  userB: string,
): Promise<ConversationWithMembers | null> => {
  const result = await query<ConversationRow>(
    `
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
  `,
    [userA, userB],
  )

  if (result.rows.length === 0) {
    return null
  }

  const conversation = mapConversationRow(result.rows[0])
  return buildConversationDescriptor(conversation)
}

/**
 * Inserts a new member into a conversation.
 * @param {PoolClient} client - The database client.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user to add.
 * @param {'owner' | 'admin' | 'member'} role - The role of the new member.
 * @private
 */
const insertConversationMember = async (
  client: PoolClient,
  conversationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
) => {
  await client.query(
    `
    INSERT INTO conversation_members (conversation_id, user_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (conversation_id, user_id) DO NOTHING
  `,
    [conversationId, userId, role],
  )
}

type ConversationMemberSummaryRow = {
  user_id: string
  role: 'owner' | 'admin' | 'member'
}

/**
 * Synchronizes the members of a conversation with a desired list of user IDs.
 * @param {string} conversationId - The ID of the conversation to sync.
 * @param {string[]} desiredUserIds - The list of user IDs that should be in the conversation.
 * @param {string} [ownerUserId] - The ID of the conversation owner, who cannot be removed.
 * @returns {Promise<{ added: string[]; removed: string[] }>} An object containing the user IDs of added and removed members.
 * @private
 */
const syncConversationMembers = async (
  conversationId: string,
  desiredUserIds: string[],
  ownerUserId?: string,
): Promise<{ added: string[]; removed: string[] }> => {
  const uniqueDesired = Array.from(new Set(desiredUserIds.filter((id) => typeof id === 'string')))
  const desiredSet = new Set(uniqueDesired)

  const existingResult = await query<ConversationMemberSummaryRow>(
    `
    SELECT user_id, role
    FROM conversation_members
    WHERE conversation_id = $1
  `,
    [conversationId],
  )

  const existingMembers = existingResult.rows
  const existingSet = new Set(existingMembers.map((member) => member.user_id))

  const toAdd = uniqueDesired.filter((userId) => !existingSet.has(userId))
  const toRemove = existingMembers
    .filter(
      (member) =>
        !desiredSet.has(member.user_id) &&
        member.role !== 'owner' &&
        member.user_id !== ownerUserId,
    )
    .map((member) => member.user_id)

  if (toAdd.length === 0 && toRemove.length === 0) {
    return { added: [], removed: [] }
  }

  await transaction(async (client) => {
    for (const userId of toAdd) {
      await insertConversationMember(client, conversationId, userId, 'member')
    }

    if (toRemove.length > 0) {
      await client.query(
        `
        DELETE FROM conversation_members
        WHERE conversation_id = $1 AND user_id = ANY($2::uuid[])
      `,
        [conversationId, toRemove],
      )
    }

    if (toAdd.length > 0 || toRemove.length > 0) {
      await client.query(
        `
        UPDATE conversations
        SET updated_at = NOW()
        WHERE id = $1
      `,
        [conversationId],
      )
    }
  })

  return { added: toAdd, removed: toRemove }
}

/**
 * Ensures a direct conversation exists between two users, creating one if it doesn't.
 * @param {string} initiatorId - The ID of the user initiating the conversation.
 * @param {string} targetUserId - The ID of the other user in the conversation.
 * @returns {Promise<ConversationWithMembers>} The direct conversation between the two users.
 * @throws {ConversationError} If the initiator is not allowed to start a conversation with the target.
 */
export async function ensureDirectConversation(
  initiatorId: string,
  targetUserId: string,
): Promise<ConversationWithMembers> {
  try {
    await assertCanStartDirectConversation(initiatorId, targetUserId)
  } catch (error) {
    if (error instanceof MessagingPolicyError) {
      throw new ConversationError(error.code, error.message)
    }
    throw error
  }

  const existing = await getDirectConversation(initiatorId, targetUserId)
  if (existing) {
    return existing
  }

  try {
    const conversationRecord = await transaction(async (client) => {
      const conversationResult = await client.query(
        `
        INSERT INTO conversations (kind, created_by, metadata)
        VALUES ('direct', $1, '{}'::jsonb)
        RETURNING ${CONVERSATION_COLUMNS}
      `,
        [initiatorId],
      )

      const row = conversationResult.rows[0]
      const conversationId = row.id as string

      await insertConversationMember(client, conversationId, initiatorId, 'owner')
      await insertConversationMember(client, conversationId, targetUserId, 'member')

      return mapConversationRow(row as ConversationRow)
    })

    return buildConversationDescriptor(conversationRecord)
  } catch (error) {
    logger.error('Failed to create direct conversation', { initiatorId, targetUserId, error })
    throw error
  }
}

/**
 * Normalizes a group conversation title.
 * @param {string | null} [title] - The title to normalize.
 * @returns {string | null} The normalized title.
 * @private
 */
const normalizeGroupTitle = (title?: string | null): string | null => {
  if (!title) return null
  const trimmed = title.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > 120) {
    throw new ConversationError('INVALID_TITLE', 'Group titles must be 120 characters or fewer')
  }
  return trimmed
}

/**
 * Normalizes and stringifies conversation metadata.
 * @param {Record<string, unknown>} [metadata] - The metadata to normalize.
 * @returns {string} The JSON stringified metadata.
 * @private
 */
const normalizeMetadata = (metadata?: Record<string, unknown>): string => {
  if (!metadata) {
    return '{}'
  }
  try {
    return JSON.stringify(metadata)
  } catch (_error) {
    throw new ConversationError(
      'INVALID_METADATA',
      'Conversation metadata must be JSON serializable',
    )
  }
}

/**
 * Creates a new group conversation.
 * @param {CreateGroupConversationOptions} options - The options for creating the group conversation.
 * @returns {Promise<ConversationWithMembers>} The newly created group conversation.
 * @throws {ConversationError} If there are not enough members, the member limit is exceeded, or an invitee is not allowed.
 */
export async function createGroupConversation(
  options: CreateGroupConversationOptions,
): Promise<ConversationWithMembers> {
  const { creatorId } = options
  const title = normalizeGroupTitle(options.title)

  const uniqueMembers = new Set<string>([creatorId])
  for (const candidate of options.memberIds ?? []) {
    if (typeof candidate === 'string' && candidate && candidate !== creatorId) {
      uniqueMembers.add(candidate)
    }
  }

  if (uniqueMembers.size < 2) {
    throw new ConversationError(
      'NOT_ENOUGH_MEMBERS',
      'Group conversations require at least two members',
    )
  }

  if (uniqueMembers.size > MAX_GROUP_MEMBERS) {
    throw new ConversationError(
      'GROUP_LIMIT',
      `Group conversations are limited to ${MAX_GROUP_MEMBERS} members`,
    )
  }

  const invitees = Array.from(uniqueMembers).filter((userId) => userId !== creatorId)

  for (const invitee of invitees) {
    try {
      await assertCanInviteToGroup(creatorId, invitee)
    } catch (error) {
      handlePolicyError(error)
    }
  }

  const metadataJson = normalizeMetadata(options.metadata)

  const conversationRecord = await transaction(async (client) => {
    const conversationResult = await client.query(
      `
      INSERT INTO conversations (kind, title, created_by, metadata)
      VALUES ('group', $1, $2, $3::jsonb)
      RETURNING ${CONVERSATION_COLUMNS}
    `,
      [title, creatorId, metadataJson],
    )

    const row = conversationResult.rows[0] as ConversationRow
    const conversationId = row.id

    await insertConversationMember(client, conversationId, creatorId, 'owner')
    for (const memberId of invitees) {
      await insertConversationMember(client, conversationId, memberId, 'member')
    }

    return mapConversationRow(row)
  })

  const descriptor = await buildConversationDescriptor(conversationRecord)
  emitConversationCreatedEvent(descriptor)
  return descriptor
}

/**
 * Adds members to a group conversation.
 * @param {AddConversationMembersOptions} options - The options for adding members.
 * @returns {Promise<ConversationMemberRole[]>} The roles of the newly added members.
 * @throws {ConversationError} If the operation is invalid, the user lacks permission, or the group limit is exceeded.
 */
export async function addMembersToConversation(
  options: AddConversationMembersOptions,
): Promise<ConversationMemberRole[]> {
  const { actorId, conversationId } = options
  const requestedIds = Array.from(
    new Set(
      (options.memberIds ?? []).filter((id) => typeof id === 'string' && id && id !== actorId),
    ),
  )

  if (requestedIds.length === 0) {
    return []
  }

  const conversation = await getConversationRow(conversationId)
  if (conversation.kind !== 'group') {
    throw new ConversationError(
      'INVALID_OPERATION',
      'Members can only be added to group conversations',
    )
  }

  const actorMembership = await ensureMembership(conversationId, actorId)
  if (actorMembership.role !== 'owner' && actorMembership.role !== 'admin') {
    throw new ConversationError('FORBIDDEN', 'You do not have permission to manage members')
  }

  const existingMembers = await getConversationMemberRoles(conversationId)
  const existingSet = new Set(existingMembers.map((member) => member.userId))

  const newMembers = requestedIds.filter((userId) => !existingSet.has(userId))
  if (newMembers.length === 0) {
    return []
  }

  if (existingMembers.length + newMembers.length > MAX_GROUP_MEMBERS) {
    throw new ConversationError(
      'GROUP_LIMIT',
      `Group conversations are limited to ${MAX_GROUP_MEMBERS} members`,
    )
  }

  for (const userId of newMembers) {
    try {
      await assertCanInviteToGroup(actorId, userId)
    } catch (error) {
      handlePolicyError(error)
    }
  }

  await transaction(async (client) => {
    for (const userId of newMembers) {
      await insertConversationMember(client, conversationId, userId, 'member')
    }
  })

  const refreshedConversation = await getConversationRow(conversationId)
  const descriptor = await buildConversationDescriptor(refreshedConversation)
  const addedMemberRoles = descriptor.memberRoles.filter((member) =>
    newMembers.includes(member.userId),
  )

  emitConversationCreatedEvent(descriptor, newMembers)
  emitConversationMembersAddedEvent(conversationId, addedMemberRoles, descriptor.memberIds)

  return addedMemberRoles
}

/**
 * Ensures a conversation exists for a game, creating one if necessary and syncing its members.
 * @param {string} gameId - The ID of the game.
 * @returns {Promise<ConversationWithMembers>} The game's conversation.
 */
export async function ensureGameConversation(gameId: string): Promise<ConversationWithMembers> {
  const { hostId, name, roomId } = await getGameRoomHost(gameId)

  const existingResult = await query<ConversationRow>(
    `
    SELECT ${CONVERSATION_COLUMNS}
    FROM conversations
    WHERE kind = 'game' AND game_id = $1
    LIMIT 1
  `,
    [roomId],
  )

  let conversationRecord: ConversationRecord

  if (existingResult.rows.length === 0) {
    const title = name ? `${name} (Game Chat)` : null
    const metadata = JSON.stringify({ gameId: roomId })

    conversationRecord = await transaction(async (client) => {
      const conversationInsert = await client.query(
        `
        INSERT INTO conversations (kind, title, created_by, metadata, game_id)
        VALUES ('game', $1, $2, $3::jsonb, $4)
        RETURNING ${CONVERSATION_COLUMNS}
      `,
        [title, hostId, metadata, roomId],
      )

      const row = conversationInsert.rows[0] as ConversationRow
      await insertConversationMember(client, row.id, hostId, 'owner')
      return mapConversationRow(row)
    })
  } else {
    conversationRecord = mapConversationRow(existingResult.rows[0] as ConversationRow)
  }

  const playerRows = await getActiveRoomPlayers(roomId)
  const desiredMembers = new Set<string>(playerRows.map((row) => row.user_id))
  desiredMembers.add(hostId)

  const { added, removed } = await syncConversationMembers(
    conversationRecord.id,
    Array.from(desiredMembers),
    hostId,
  )

  const descriptor = await buildConversationDescriptor(conversationRecord)

  if (added.length > 0) {
    const addedRoles = descriptor.memberRoles.filter((member) => added.includes(member.userId))
    emitConversationMembersAddedEvent(conversationRecord.id, addedRoles, descriptor.memberIds)
  }

  if (removed.length > 0) {
    emitConversationMembersRemovedEvent(conversationRecord.id, removed, descriptor.memberIds)
  }

  emitConversationUpdatedEvent(descriptor)
  return descriptor
}

/**
 * Ensures a conversation exists for a clan, creating one if necessary and syncing its members.
 * @param {string} clanId - The ID of the clan.
 * @returns {Promise<ConversationWithMembers>} The clan's conversation.
 * @throws {ConversationError} If the clan is not found.
 */
export async function ensureClanConversation(clanId: string): Promise<ConversationWithMembers> {
  // Lookup clan owner and name
  const clanResult = await query<{ id: string; owner_user_id: string; name: string }>(
    `SELECT id, owner_user_id, name FROM clans WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [clanId],
  )
  const clan = clanResult.rows[0]
  if (!clan) {
    throw new ConversationError('NOT_FOUND', 'Clan not found')
  }

  // Check if conversation already exists for this clan
  const existing = await query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS}, clan_id FROM conversations WHERE clan_id = $1 LIMIT 1`,
    [clanId],
  )

  let conversationRecord: ConversationRecord

  if (existing.rows.length === 0) {
    const title = `${clan.name} — Clan Chat`
    const metadata = JSON.stringify({ clanId })

    conversationRecord = await transaction(async (client) => {
      const insert = await client.query(
        `
          INSERT INTO conversations (kind, title, created_by, metadata, clan_id)
          VALUES ('group', $1, $2, $3::jsonb, $4)
          RETURNING ${CONVERSATION_COLUMNS}, clan_id
        `,
        [title, clan.owner_user_id, metadata, clan.id],
      )
      const row = insert.rows[0] as ConversationRow
      await insertConversationMember(client, row.id, clan.owner_user_id, 'owner')
      return mapConversationRow(row)
    })
  } else {
    conversationRecord = mapConversationRow(existing.rows[0] as ConversationRow)
  }

  // Sync members with active clan members
  const members = await query<{ user_id: string }>(
    `SELECT user_id FROM clan_members WHERE clan_id = $1 AND status = 'active'`,
    [clanId],
  )
  const desired = new Set<string>(members.rows.map((r) => r.user_id))
  desired.add(clan.owner_user_id)

  const { added, removed } = await syncConversationMembers(
    conversationRecord.id,
    Array.from(desired),
    clan.owner_user_id,
  )

  const descriptor = await buildConversationDescriptor(conversationRecord)
  if (added.length > 0) {
    const addedRoles = descriptor.memberRoles.filter((m) => added.includes(m.userId))
    emitConversationMembersAddedEvent(conversationRecord.id, addedRoles, descriptor.memberIds)
  }
  if (removed.length > 0) {
    emitConversationMembersRemovedEvent(conversationRecord.id, removed, descriptor.memberIds)
  }
  emitConversationUpdatedEvent(descriptor)
  return descriptor
}

/**
 * Ensures a conversation exists for a team in a game, creating one if necessary and syncing its members.
 * @param {string} gameId - The ID of the game.
 * @param {number} teamId - The ID of the team.
 * @returns {Promise<ConversationWithMembers>} The team's conversation.
 */
export async function ensureTeamConversation(
  gameId: string,
  teamId: number,
): Promise<ConversationWithMembers> {
  const { hostId, name, roomId } = await getGameRoomHost(gameId)

  const existingResult = await query<ConversationRow>(
    `
    SELECT ${CONVERSATION_COLUMNS}
    FROM conversations
    WHERE kind = 'team'
      AND game_id = $1
      AND metadata ->> 'teamId' = $2
    LIMIT 1
  `,
    [roomId, String(teamId)],
  )

  let conversationRecord: ConversationRecord

  if (existingResult.rows.length === 0) {
    const title = name ? `${name} — Team ${teamId}` : `Team ${teamId}`
    const metadata = JSON.stringify({ gameId: roomId, teamId })

    conversationRecord = await transaction(async (client) => {
      const conversationInsert = await client.query(
        `
        INSERT INTO conversations (kind, title, created_by, metadata, game_id)
        VALUES ('team', $1, $2, $3::jsonb, $4)
        RETURNING ${CONVERSATION_COLUMNS}
      `,
        [title, hostId, metadata, roomId],
      )

      const row = conversationInsert.rows[0] as ConversationRow
      await insertConversationMember(client, row.id, hostId, 'owner')
      return mapConversationRow(row)
    })
  } else {
    conversationRecord = mapConversationRow(existingResult.rows[0] as ConversationRow)
  }

  const playerRows = await getActiveRoomPlayers(roomId)
  const desiredMembers = playerRows
    .filter((row) => row.team_id === teamId)
    .map((row) => row.user_id)

  desiredMembers.push(hostId)

  const { added, removed } = await syncConversationMembers(
    conversationRecord.id,
    desiredMembers,
    hostId,
  )

  const descriptor = await buildConversationDescriptor(conversationRecord)

  if (added.length > 0) {
    const addedRoles = descriptor.memberRoles.filter((member) => added.includes(member.userId))
    emitConversationMembersAddedEvent(conversationRecord.id, addedRoles, descriptor.memberIds)
  }

  if (removed.length > 0) {
    emitConversationMembersRemovedEvent(conversationRecord.id, removed, descriptor.memberIds)
  }

  emitConversationUpdatedEvent(descriptor)
  return descriptor
}

/**
 * Allows a user to leave a group conversation.
 * @param {string} conversationId - The ID of the conversation to leave.
 * @param {string} userId - The ID of the user leaving.
 * @returns {Promise<void>}
 * @throws {ConversationError} If the conversation is not a group or the user is not a member.
 */
export async function leaveConversation(conversationId: string, userId: string): Promise<void> {
  const conversation = await getConversationRow(conversationId)
  if (conversation.kind !== 'group') {
    throw new ConversationError(
      'INVALID_OPERATION',
      'Leave is only supported for group conversations',
    )
  }

  await transaction(async (client) => {
    const membershipResult = await client.query<ConversationMemberRow>(
      `
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `,
      [conversationId, userId],
    )

    if (membershipResult.rows.length === 0) {
      throw new ConversationError('NOT_MEMBER', 'User is not a member of this conversation')
    }

    const membership = membershipResult.rows[0]

    const othersResult = await client.query<ConversationMemberRow>(
      `
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id <> $2
      ORDER BY role = 'admin' DESC, joined_at ASC
      FOR UPDATE
    `,
      [conversationId, userId],
    )

    if (membership.role === 'owner' && othersResult.rows.length > 0) {
      const nextOwner = othersResult.rows[0]
      await client.query(
        `
        UPDATE conversation_members
        SET role = 'owner', updated_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2
      `,
        [conversationId, nextOwner.user_id],
      )
    }

    await client.query(
      `
      DELETE FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
    `,
      [conversationId, userId],
    )

    if (membership.role === 'owner' && othersResult.rows.length === 0) {
      await client.query(
        `
        UPDATE conversations
        SET is_archived = TRUE, updated_at = NOW()
        WHERE id = $1
      `,
        [conversationId],
      )
    } else {
      await client.query(
        `
        UPDATE conversations
        SET updated_at = NOW()
        WHERE id = $1
      `,
        [conversationId],
      )
    }
  })

  const descriptor = await buildConversationDescriptor(await getConversationRow(conversationId))
  emitConversationMembersRemovedEvent(conversationId, [userId], descriptor.memberIds)
}

/**
 * Removes a member from a group conversation.
 * @param {RemoveConversationMemberOptions} options - The options for removing the member.
 * @returns {Promise<void>}
 * @throws {ConversationError} If the operation is invalid, the actor lacks permission, or the target is not a member.
 */
export async function removeConversationMember(
  options: RemoveConversationMemberOptions,
): Promise<void> {
  const { actorId, conversationId, targetUserId } = options
  if (actorId === targetUserId) {
    throw new ConversationError('INVALID_OPERATION', 'Use the leave endpoint to remove yourself')
  }

  const conversation = await getConversationRow(conversationId)
  if (conversation.kind !== 'group') {
    throw new ConversationError(
      'INVALID_OPERATION',
      'Remove member is only supported for group conversations',
    )
  }

  await transaction(async (client) => {
    const actorResult = await client.query<ConversationMemberRow>(
      `
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `,
      [conversationId, actorId],
    )

    if (actorResult.rows.length === 0) {
      throw new ConversationError('NOT_MEMBER', 'You are not a member of this conversation')
    }

    const actor = actorResult.rows[0]
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      throw new ConversationError('FORBIDDEN', 'You do not have permission to remove members')
    }

    const targetResult = await client.query<ConversationMemberRow>(
      `
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `,
      [conversationId, targetUserId],
    )

    if (targetResult.rows.length === 0) {
      throw new ConversationError('NOT_MEMBER', 'Target user is not part of this conversation')
    }

    const target = targetResult.rows[0]
    if (target.role === 'owner') {
      throw new ConversationError('FORBIDDEN', 'Cannot remove the conversation owner')
    }

    await client.query(
      `
      DELETE FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
    `,
      [conversationId, targetUserId],
    )

    await client.query(
      `
      UPDATE conversations
      SET updated_at = NOW()
      WHERE id = $1
    `,
      [conversationId],
    )
  })

  const descriptor = await buildConversationDescriptor(await getConversationRow(conversationId))
  emitConversationMembersRemovedEvent(conversationId, [targetUserId], descriptor.memberIds)
}

/**
 * Updates the role of a member in a conversation.
 * @param {UpdateConversationMemberRoleOptions} options - The options for updating the member's role.
 * @returns {Promise<ConversationMemberRole>} The updated member role.
 * @throws {ConversationError} If the role is invalid, the operation is not supported, or the user lacks permission.
 */
export async function updateConversationMemberRole(
  options: UpdateConversationMemberRoleOptions,
): Promise<ConversationMemberRole> {
  const { actorId, conversationId, targetUserId, role } = options

  if (role !== 'admin' && role !== 'member') {
    throw new ConversationError('INVALID_ROLE', 'Only admin and member roles are supported')
  }

  await transaction(async (client) => {
    const conversationResult = await client.query<ConversationRow>(
      `
      SELECT ${CONVERSATION_COLUMNS}
      FROM conversations
      WHERE id = $1
      FOR UPDATE
    `,
      [conversationId],
    )

    if (conversationResult.rows.length === 0) {
      throw new ConversationError('NOT_FOUND', 'Conversation not found')
    }

    const conversationRow = conversationResult.rows[0]
    if (conversationRow.kind !== 'group') {
      throw new ConversationError(
        'INVALID_OPERATION',
        'Role updates are only supported for group conversations',
      )
    }

    const actorResult = await client.query<ConversationMemberRow>(
      `
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `,
      [conversationId, actorId],
    )

    if (actorResult.rows.length === 0) {
      throw new ConversationError('NOT_MEMBER', 'You are not a member of this conversation')
    }

    const actorRole = actorResult.rows[0].role
    if (actorRole !== 'owner' && actorRole !== 'admin') {
      throw new ConversationError('FORBIDDEN', 'You do not have permission to change roles')
    }

    const targetResult = await client.query<ConversationMemberRow>(
      `
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `,
      [conversationId, targetUserId],
    )

    if (targetResult.rows.length === 0) {
      throw new ConversationError('NOT_MEMBER', 'Target user is not part of this conversation')
    }

    const target = targetResult.rows[0]
    if (target.role === 'owner') {
      throw new ConversationError('FORBIDDEN', 'Cannot change the conversation owner role')
    }

    if (actorRole === 'admin' && target.role !== 'member') {
      throw new ConversationError('FORBIDDEN', 'Admins can only manage member roles')
    }

    if (target.role === role) {
      return
    }

    await client.query(
      `
      UPDATE conversation_members
      SET role = $3, updated_at = NOW()
      WHERE conversation_id = $1 AND user_id = $2
    `,
      [conversationId, targetUserId, role],
    )

    await client.query(
      `
      UPDATE conversations
      SET updated_at = NOW()
      WHERE id = $1
    `,
      [conversationId],
    )
  })

  const descriptor = await buildConversationDescriptor(await getConversationRow(conversationId))
  const updatedMember = descriptor.memberRoles.find((member) => member.userId === targetUserId)
  if (!updatedMember) {
    throw new ConversationError('NOT_MEMBER', 'Target user is not part of this conversation')
  }

  emitConversationMembersChangedEvent(conversationId, [updatedMember], descriptor.memberIds)

  return updatedMember
}

/**
 * Sets the archived status of a conversation.
 * @param {SetConversationArchivedOptions} options - The options for setting the archived status.
 * @returns {Promise<ConversationWithMembers>} The updated conversation.
 * @throws {ConversationError} If the operation is not supported or the user lacks permission.
 */
export async function setConversationArchived(
  options: SetConversationArchivedOptions,
): Promise<ConversationWithMembers> {
  const { actorId, conversationId, archived } = options

  let changed = false

  await transaction(async (client) => {
    const conversationResult = await client.query<ConversationRow>(
      `
      SELECT ${CONVERSATION_COLUMNS}
      FROM conversations
      WHERE id = $1
      FOR UPDATE
    `,
      [conversationId],
    )

    if (conversationResult.rows.length === 0) {
      throw new ConversationError('NOT_FOUND', 'Conversation not found')
    }

    const conversationRow = conversationResult.rows[0]
    if (conversationRow.kind !== 'group') {
      throw new ConversationError(
        'INVALID_OPERATION',
        'Archiving is only supported for group conversations',
      )
    }

    const actorResult = await client.query<ConversationMemberRow>(
      `
      SELECT user_id, role, joined_at, shadow_muted
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
      FOR UPDATE
    `,
      [conversationId, actorId],
    )

    if (actorResult.rows.length === 0) {
      throw new ConversationError('NOT_MEMBER', 'You are not a member of this conversation')
    }

    const actorRole = actorResult.rows[0].role
    if (actorRole !== 'owner' && actorRole !== 'admin') {
      throw new ConversationError(
        'FORBIDDEN',
        'You do not have permission to archive this conversation',
      )
    }

    if (conversationRow.is_archived === archived) {
      return
    }

    await client.query(
      `
      UPDATE conversations
      SET is_archived = $2, updated_at = NOW()
      WHERE id = $1
    `,
      [conversationId, archived],
    )

    changed = true
  })

  const descriptor = await buildConversationDescriptor(await getConversationRow(conversationId))
  if (changed) {
    emitConversationUpdatedEvent(descriptor)
  }
  return descriptor
}

/**
 * Ensures that a user is a member of a conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<{ role: string; shadowMuted: boolean; joinedAt: Date }>} The user's membership details.
 * @throws {ConversationError} If the user is not a member.
 * @private
 */
const ensureMembership = async (
  conversationId: string,
  userId: string,
): Promise<{ role: string; shadowMuted: boolean; joinedAt: Date }> => {
  const membershipResult = await query<ConversationMemberRow>(
    `
    SELECT user_id, role, joined_at, shadow_muted
    FROM conversation_members
    WHERE conversation_id = $1 AND user_id = $2
  `,
    [conversationId, userId],
  )

  if (membershipResult.rows.length === 0) {
    throw new ConversationError('NOT_MEMBER', 'User is not a member of this conversation')
  }

  const row = membershipResult.rows[0]
  return { role: row.role, shadowMuted: row.shadow_muted ?? false, joinedAt: row.joined_at }
}

/**
 * Retrieves a conversation's database row by its ID.
 * @param {string} conversationId - The ID of the conversation.
 * @returns {Promise<ConversationRecord>} The conversation record.
 * @throws {ConversationError} If the conversation is not found.
 * @private
 */
const getConversationRow = async (conversationId: string): Promise<ConversationRecord> => {
  const result = await query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE id = $1`,
    [conversationId],
  )

  if (result.rows.length === 0) {
    throw new ConversationError('NOT_FOUND', 'Conversation not found')
  }

  return mapConversationRow(result.rows[0])
}

/**
 * Resolves a user's access level to a conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user.
 * @param {ResolveConversationAccessOptions} [options={}] - Options for resolving access.
 * @returns {Promise<ConversationAccessResult>} The user's access level and membership details.
 * @throws {ConversationError} If the user does not have access.
 * @private
 */
const resolveConversationAccess = async (
  conversationId: string,
  userId: string,
  options: ResolveConversationAccessOptions = {},
): Promise<ConversationAccessResult> => {
  const conversation = await getConversationRow(conversationId)

  const membershipResult = await query<ConversationMembershipDetailRow>(
    `
    SELECT role, shadow_muted, joined_at, is_muted, is_pinned, last_read_message_id, last_read_at
    FROM conversation_members
    WHERE conversation_id = $1 AND user_id = $2
  `,
    [conversationId, userId],
  )

  if (membershipResult.rows.length > 0) {
    return {
      conversation,
      membership: membershipResult.rows[0],
      accessLevel: 'member',
    }
  }

  if (options.allowSpectatorGameAccess && conversation.kind === 'game') {
    if (!conversation.gameId) {
      throw new ConversationError('NOT_FOUND', 'Game conversation not linked to a room')
    }

    const privacyResult = await query<{ is_private: boolean | null }>(
      'SELECT is_private FROM game_rooms WHERE id = $1',
      [conversation.gameId],
    )

    const isPrivate = privacyResult.rows[0]?.is_private ?? true
    if (!isPrivate) {
      return {
        conversation,
        membership: undefined,
        accessLevel: 'spectator',
      }
    }
  }

  throw new ConversationError('NOT_MEMBER', 'User is not a member of this conversation')
}

/**
 * Retrieves the other member in a direct conversation.
 * @param {string} conversationId - The ID of the direct conversation.
 * @param {string} senderId - The ID of the known member (sender).
 * @returns {Promise<string | null>} The ID of the other member, or null if not found.
 * @private
 */
const getOtherDirectMember = async (
  conversationId: string,
  senderId: string,
): Promise<string | null> => {
  const result = await query<DirectMemberRow>(
    `
    SELECT user_id
    FROM conversation_members
    WHERE conversation_id = $1 AND user_id <> $2
    LIMIT 1
  `,
    [conversationId, senderId],
  )

  if (result.rows.length === 0) {
    return null
  }

  return result.rows[0].user_id
}

type RoomPlayerRow = {
  user_id: string
  team_id: number | null
}

/**
 * Retrieves the host and other details of a game room.
 * @param {string} gameIdentifier - The ID or room code of the game.
 * @returns {Promise<{ hostId: string; name: string | null; roomId: string }>} The game room details.
 * @throws {ConversationError} If the game room is not found or the identifier is invalid.
 * @private
 */
const getGameRoomHost = async (
  gameIdentifier: string,
): Promise<{ hostId: string; name: string | null; roomId: string }> => {
  const isUUID = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

  const isNumeric = (value: string): boolean => /^[0-9]+$/.test(value)

  let row: { id: string; host_id: string; name: string | null }
  if (isUUID(gameIdentifier)) {
    const result = await query<{ id: string; host_id: string; name: string | null }>(
      `
      SELECT id, host_id, name
      FROM game_rooms
      WHERE id = $1::uuid
    `,
      [gameIdentifier],
    )
    if (result.rows.length === 0) {
      throw new ConversationError('NOT_FOUND', 'Game room not found')
    }
    row = result.rows[0]
  } else if (isNumeric(gameIdentifier)) {
    const result = await query<{ id: string; host_id: string; name: string | null }>(
      `
      SELECT id, host_id, name
      FROM game_rooms
      WHERE room_code = $1::bigint
    `,
      [gameIdentifier],
    )
    if (result.rows.length === 0) {
      throw new ConversationError('NOT_FOUND', 'Game room not found')
    }
    row = result.rows[0]
  } else {
    throw new ConversationError('INVALID_TARGET', 'Invalid game identifier')
  }

  return { hostId: row.host_id, name: row.name, roomId: row.id }
}

/**
 * Retrieves the active players in a game room.
 * @param {string} gameId - The ID of the game room.
 * @returns {Promise<RoomPlayerRow[]>} A list of active players in the room.
 * @private
 */
const getActiveRoomPlayers = async (gameId: string): Promise<RoomPlayerRow[]> => {
  const result = await query<RoomPlayerRow>(
    `
    SELECT user_id, team_id
    FROM room_players
    WHERE room_id = $1 AND (left_at IS NULL)
  `,
    [gameId],
  )

  return result.rows
}

/** @private */
const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value

/**
 * Serializes a conversation for a socket.io event.
 * @param {ConversationWithMembers} conversation - The conversation to serialize.
 * @returns {object} The serialized conversation.
 * @private
 */
const serializeConversationForEvent = (conversation: ConversationWithMembers) => ({
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
})

/**
 * Emits a 'conversation.created' event to the relevant user sockets.
 * @param {ConversationWithMembers} conversation - The conversation that was created.
 * @param {string[]} [recipients] - Optional list of recipient user IDs. If not provided, all members of the conversation will be notified.
 * @private
 */
const emitConversationCreatedEvent = (
  conversation: ConversationWithMembers,
  recipients?: string[],
) => {
  try {
    const io = tryGetSocketServer()
    if (!io) {
      return
    }

    const payload = {
      conversation: serializeConversationForEvent(conversation),
      members: conversation.memberRoles.map(({ userId, role, username }) => ({
        userId,
        role,
        username,
      })),
    }

    const targetUserIds = recipients ?? conversation.memberIds
    for (const userId of targetUserIds) {
      io.to(`user:${userId}`).emit('conversation.created', payload)
    }
  } catch (error) {
    logger.warn('Failed to emit conversation.created event', {
      conversationId: conversation.id,
      error,
    })
  }
}

/**
 * Emits a 'conversation.members.added' event to the relevant user sockets.
 * @param {string} conversationId - The ID of the conversation.
 * @param {ConversationMemberRole[]} addedMembers - The members that were added.
 * @param {string[]} recipients - The list of recipient user IDs.
 * @private
 */
const emitConversationMembersAddedEvent = (
  conversationId: string,
  addedMembers: ConversationMemberRole[],
  recipients: string[],
) => {
  if (addedMembers.length === 0) {
    return
  }

  try {
    const io = tryGetSocketServer()
    if (!io) {
      return
    }

    const payload = {
      conversationId,
      members: addedMembers.map(({ userId, role, username }) => ({ userId, role, username })),
    }

    for (const userId of recipients) {
      io.to(`user:${userId}`).emit('conversation.members.added', payload)
    }
  } catch (error) {
    logger.warn('Failed to emit conversation.members.added event', {
      conversationId,
      error,
    })
  }
}

/**
 * Emits a 'conversation.members.removed' event to the relevant user sockets.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string[]} removedUserIds - The IDs of the members that were removed.
 * @param {string[]} recipients - The list of recipient user IDs.
 * @private
 */
const emitConversationMembersRemovedEvent = (
  conversationId: string,
  removedUserIds: string[],
  recipients: string[],
) => {
  if (removedUserIds.length === 0) {
    return
  }

  try {
    const io = tryGetSocketServer()
    if (!io) {
      return
    }

    const payload = {
      conversationId,
      members: removedUserIds.map((userId) => ({ userId })),
    }

    for (const userId of recipients) {
      io.to(`user:${userId}`).emit('conversation.members.removed', payload)
    }
  } catch (error) {
    logger.warn('Failed to emit conversation.members.removed event', {
      conversationId,
      error,
    })
  }
}

/**
 * Emits a 'conversation.members.changed' event to the relevant user sockets.
 * @param {string} conversationId - The ID of the conversation.
 * @param {ConversationMemberRole[]} members - The members whose roles have changed.
 * @param {string[]} recipients - The list of recipient user IDs.
 * @private
 */
const emitConversationMembersChangedEvent = (
  conversationId: string,
  members: ConversationMemberRole[],
  recipients: string[],
) => {
  if (members.length === 0) {
    return
  }

  try {
    const io = tryGetSocketServer()
    if (!io) {
      return
    }

    const payload = {
      conversationId,
      members: members.map(({ userId, role }) => ({ userId, role })),
    }

    io.to(`conversation:${conversationId}`).emit('conversation.members.changed', payload)
    for (const userId of recipients) {
      io.to(`user:${userId}`).emit('conversation.members.changed', payload)
    }
  } catch (error) {
    logger.warn('Failed to emit conversation.members.changed event', {
      conversationId,
      error,
    })
  }
}

/**
 * Emits a 'conversation.message.new' event to the relevant user sockets.
 * @param {ConversationWithMembers} descriptor - The conversation descriptor.
 * @param {ConversationMessageRecord} message - The new message.
 * @private
 */
const emitConversationMessageEvent = (
  descriptor: ConversationWithMembers,
  message: ConversationMessageRecord,
) => {
  try {
    const io = tryGetSocketServer()
    if (!io) {
      return
    }

    const payload: ConversationMessageEventPayload = {
      conversationId: descriptor.id,
      id: message.id,
      senderId: message.senderId,
      body: message.body,
      createdAt: toIsoString(message.createdAt),
      metadata: message.jsonMetadata ?? {},
    }

    io.to(`conversation:${descriptor.id}`).emit('conversation.message.new', payload)
    io.to(`conversation:${descriptor.id}`).emit('message.new', payload)
    for (const userId of descriptor.memberIds) {
      io.to(`user:${userId}`).emit('conversation.message.new', payload)
      io.to(`user:${userId}`).emit('message.new', payload)
    }
  } catch (error) {
    logger.warn('Failed to emit conversation.message.new event', {
      conversationId: descriptor.id,
      error,
    })
  }
}

/**
 * Emits a 'conversation.updated' event to the relevant user sockets.
 * @param {ConversationWithMembers} conversation - The updated conversation.
 * @private
 */
const emitConversationUpdatedEvent = (conversation: ConversationWithMembers) => {
  try {
    const io = tryGetSocketServer()
    if (!io) {
      return
    }

    const payload = {
      conversation: serializeConversationForEvent(conversation),
    }

    io.to(`conversation:${conversation.id}`).emit('conversation.updated', payload)
    for (const userId of conversation.memberIds) {
      io.to(`user:${userId}`).emit('conversation.updated', payload)
    }
  } catch (error) {
    logger.warn('Failed to emit conversation.updated event', {
      conversationId: conversation.id,
      error,
    })
  }
}

/**
 * @interface SendMessageOptions
 * @description Options for sending a message to a conversation.
 */
export interface SendMessageOptions {
  conversationId: string
  senderId: string
  body: string
  clientMessageId?: string
  metadata?: Record<string, unknown>
}

/**
 * @interface CreateGroupConversationOptions
 * @description Options for creating a new group conversation.
 */
export interface CreateGroupConversationOptions {
  creatorId: string
  title?: string | null
  memberIds: string[]
  metadata?: Record<string, unknown>
}

/**
 * @interface AddConversationMembersOptions
 * @description Options for adding members to a conversation.
 */
export interface AddConversationMembersOptions {
  actorId: string
  conversationId: string
  memberIds: string[]
}

/**
 * @interface RemoveConversationMemberOptions
 * @description Options for removing a member from a conversation.
 */
export interface RemoveConversationMemberOptions {
  actorId: string
  conversationId: string
  targetUserId: string
}

/**
 * @interface UpdateConversationMemberRoleOptions
 * @description Options for updating a member's role in a conversation.
 */
export interface UpdateConversationMemberRoleOptions {
  actorId: string
  conversationId: string
  targetUserId: string
  role: 'admin' | 'member'
}

/**
 * @interface SetConversationArchivedOptions
 * @description Options for setting the archived status of a conversation.
 */
export interface SetConversationArchivedOptions {
  actorId: string
  conversationId: string
  archived: boolean
}

/**
 * Sends a message to a conversation.
 * @param {SendMessageOptions} options - The options for sending the message.
 * @returns {Promise<ConversationMessageRecord>} The newly created message record.
 * @throws {ConversationError} If the message body is empty, too long, or the sender is not allowed to send a message.
 */
export async function sendMessage(options: SendMessageOptions): Promise<ConversationMessageRecord> {
  const { conversationId, senderId, body, clientMessageId, metadata } = options

  const trimmed = body?.trim()
  if (!trimmed) {
    throw new ConversationError('EMPTY_MESSAGE', 'Message body is required')
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new ConversationError('MESSAGE_TOO_LONG', 'Message exceeds the allowed length')
  }

  const access = await resolveConversationAccess(conversationId, senderId, {
    allowSpectatorGameAccess: true,
  })
  const conversation = access.conversation

  if (conversation.kind === 'direct') {
    const otherMember = await getOtherDirectMember(conversationId, senderId)
    if (otherMember) {
      try {
        await assertCanSendDirectMessage(senderId, otherMember)
      } catch (error) {
        if (error instanceof MessagingPolicyError) {
          throw new ConversationError(error.code, error.message)
        }
        throw error
      }
    }
  }

  const descriptor = await buildConversationDescriptor(conversation)

  if (clientMessageId) {
    const existing = await query<ConversationMessageRow>(
      `
      SELECT *
      FROM conversation_messages
      WHERE conversation_id = $1
        AND sender_id = $2
        AND json_metadata ->> 'clientMessageId' = $3
      LIMIT 1
    `,
      [conversationId, senderId, clientMessageId],
    )

    if (existing.rows.length > 0) {
      return mapMessageRow(existing.rows[0])
    }
  }

  let senderName: string | undefined
  if (senderId) {
    const senderResult = await query<{ username: string }>(
      `SELECT username FROM users WHERE id = $1`,
      [senderId],
    )
    senderName = senderResult.rows[0]?.username
  }

  const jsonMetadata = {
    ...(metadata ?? {}),
    ...(clientMessageId ? { clientMessageId } : {}),
    ...(senderName ? { senderName } : {}),
    ...(access.accessLevel === 'spectator' ? { senderRole: 'spectator' } : {}),
  }

  const insertResult = await query<ConversationMessageRow>(
    `
    INSERT INTO conversation_messages (conversation_id, sender_id, body, json_metadata)
    VALUES ($1, $2, $3, $4::jsonb)
    RETURNING *
  `,
    [conversationId, senderId, trimmed, JSON.stringify(jsonMetadata)],
  )

  const message = mapMessageRow(insertResult.rows[0])

  if (access.accessLevel === 'member') {
    await query(
      `
      UPDATE conversation_members
      SET last_read_message_id = $1,
          last_read_at = NOW()
      WHERE conversation_id = $2 AND user_id = $3
    `,
      [message.id, conversationId, senderId],
    )
  }

  emitConversationMessageEvent(descriptor, message)

  return message
}

/**
 * Lists messages in a conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user requesting the messages.
 * @param {number} [limit=50] - The maximum number of messages to return.
 * @param {string} [before] - A cursor for pagination (message ID to fetch messages before).
 * @returns {Promise<ConversationMessageRecord[]>} A list of messages.
 * @throws {ConversationError} If the user does not have access to the conversation or the limit is invalid.
 */
export async function listMessages(
  conversationId: string,
  userId: string,
  limit = 50,
  before?: string,
): Promise<ConversationMessageRecord[]> {
  if (limit <= 0 || limit > 100) {
    throw new ConversationError('INVALID_PAGINATION', 'Limit must be between 1 and 100')
  }

  await resolveConversationAccess(conversationId, userId, {
    allowSpectatorGameAccess: true,
  })

  const params: Array<string | number> = [conversationId]
  let cursorClause = ''

  if (before) {
    params.push(before)
    cursorClause = 'AND id < $2'
  }

  params.push(limit)

  const result = await query<ConversationMessageRow>(
    `
    SELECT *
    FROM conversation_messages
    WHERE conversation_id = $1
      ${cursorClause}
    ORDER BY created_at DESC
    LIMIT $${params.length}
  `,
    params,
  )

  return result.rows.map(mapMessageRow)
}

interface ConversationListRow extends ConversationRow {
  member_role: 'owner' | 'admin' | 'member'
  joined_at: Date
  is_muted: boolean | null
  is_pinned: boolean | null
  shadow_muted: boolean | null
  last_read_message_id: string | null
  last_read_at: Date | null
  unread_count: number | null
  last_message_id: string | null
  last_message_body: string | null
  last_message_created_at: Date | null
  last_message_sender_id: string | null
  last_message_metadata: Record<string, unknown> | null
}

/**
 * @interface ConversationMembershipInfo
 * @description Represents a user's membership information in a conversation.
 */
export interface ConversationMembershipInfo {
  role: 'owner' | 'admin' | 'member'
  joinedAt: Date
  isMuted: boolean
  isPinned: boolean
  shadowMuted: boolean
  lastReadMessageId: string | null
  lastReadAt: Date | null
  accessLevel: ConversationAccessLevel
}

/**
 * @interface ConversationListEntry
 * @description Represents an entry in a user's list of conversations.
 */
export interface ConversationListEntry {
  conversation: ConversationWithMembers
  membership: ConversationMembershipInfo
  unreadCount: number
  lastMessage?: {
    id: string
    body: string
    senderId: string | null
    createdAt: Date
    metadata: Record<string, unknown>
  }
}

/**
 * @interface ConversationListOptions
 * @description Options for listing a user's conversations.
 */
export interface ConversationListOptions {
  limit?: number
  offset?: number
}

/**
 * Marks a conversation as read by a user.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<void>}
 */
export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const access = await resolveConversationAccess(conversationId, userId, {
    allowSpectatorGameAccess: true,
  })

  if (access.accessLevel !== 'member') {
    return
  }

  const latestResult = await query<ConversationMessageRow>(
    `
    SELECT id, created_at
    FROM conversation_messages
    WHERE conversation_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `,
    [conversationId],
  )

  const latestMessage = latestResult.rows[0] ?? null
  const lastReadId = latestMessage?.id ?? null
  const lastReadAt = latestMessage?.created_at ?? new Date()

  await query(
    `
    UPDATE conversation_members
    SET
      last_read_message_id = $3,
      last_read_at = $4,
      updated_at = NOW()
    WHERE conversation_id = $1 AND user_id = $2
  `,
    [conversationId, userId, lastReadId, lastReadAt],
  )
}

export interface ConversationDetailResult {
  conversation: ConversationWithMembers
  membership: ConversationMembershipInfo
  unreadCount: number
}

/**
 * Retrieves the detailed information for a single conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user requesting the details.
 * @param {ResolveConversationAccessOptions} [options={}] - Options for resolving access.
 * @returns {Promise<ConversationDetailResult>} The detailed conversation information.
 */
export async function getConversationDetail(
  conversationId: string,
  userId: string,
  options: ResolveConversationAccessOptions = {},
): Promise<ConversationDetailResult> {
  const access = await resolveConversationAccess(conversationId, userId, options)
  const descriptor = await buildConversationDescriptor(access.conversation)

  if (access.accessLevel === 'spectator') {
    const membership: ConversationMembershipInfo = {
      role: 'member',
      joinedAt: new Date(),
      isMuted: false,
      isPinned: false,
      shadowMuted: false,
      lastReadMessageId: null,
      lastReadAt: null,
      accessLevel: 'spectator',
    }

    return {
      conversation: descriptor,
      membership,
      unreadCount: 0,
    }
  }

  if (!access.membership) {
    throw new ConversationError('NOT_MEMBER', 'User is not a member of this conversation')
  }
  const membershipRow = access.membership

  const unreadResult = await query<{ count: number }>(
    `
    SELECT COUNT(*)::INT AS count
    FROM conversation_messages
    WHERE conversation_id = $1
      AND ($2::TIMESTAMPTZ IS NULL OR created_at > $2)
  `,
    [conversationId, membershipRow.last_read_at],
  )

  const membership: ConversationMembershipInfo = {
    role: membershipRow.role,
    joinedAt: membershipRow.joined_at,
    isMuted: membershipRow.is_muted ?? false,
    isPinned: membershipRow.is_pinned ?? false,
    shadowMuted: membershipRow.shadow_muted ?? false,
    lastReadMessageId: membershipRow.last_read_message_id ?? null,
    lastReadAt: membershipRow.last_read_at ?? null,
    accessLevel: 'member',
  }

  return {
    conversation: descriptor,
    membership,
    unreadCount: unreadResult.rows[0]?.count ?? 0,
  }
}

export interface UnreadSummaryEntry {
  conversationId: string
  unreadCount: number
}

/**
 * Retrieves a summary of unread messages for a user.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<UnreadSummaryEntry[]>} A list of conversations with their unread counts.
 */
export async function getUnreadSummary(userId: string): Promise<UnreadSummaryEntry[]> {
  const result = await query<{ conversation_id: string; unread_count: number }>(
    `
    SELECT
      cm.conversation_id,
      COALESCE(unread.unread_count, 0) AS unread_count
    FROM conversation_members cm
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INT AS unread_count
      FROM conversation_messages m
      WHERE m.conversation_id = cm.conversation_id
        AND m.deleted_at IS NULL
        AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
    ) unread ON TRUE
    WHERE cm.user_id = $1
  `,
    [userId],
  )

  return result.rows.map((row) => ({
    conversationId: row.conversation_id,
    unreadCount: Number(row.unread_count ?? 0),
  }))
}

/**
 * Lists all conversations for a user.
 * @param {string} userId - The ID of the user.
 * @param {ConversationListOptions} [options={}] - Options for pagination.
 * @returns {Promise<ConversationListEntry[]>} A list of the user's conversations.
 */
export async function listConversationsForUser(
  userId: string,
  options: ConversationListOptions = {},
): Promise<ConversationListEntry[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const result = await query<ConversationListRow>(
    `
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
        AND m.deleted_at IS NULL
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
  `,
    [userId, limit, offset],
  )

  const entries: ConversationListEntry[] = []

  const memberRolesByConversation = await getConversationMemberRolesBulk(
    result.rows.map((row) => row.id),
  )

  const descriptorCache = new Map<string, ConversationWithMembers>()

  for (const row of result.rows) {
    const record = mapConversationRow(row)
    const cached = descriptorCache.get(record.id)
    const descriptor =
      cached ??
      (await buildConversationDescriptor(record, memberRolesByConversation.get(record.id)))

    if (!cached) {
      descriptorCache.set(record.id, descriptor)
    }

    const membership: ConversationMembershipInfo = {
      role: row.member_role,
      joinedAt:
        descriptor.memberRoles.find((member) => member.userId === userId)?.joinedAt ??
        row.joined_at,
      isMuted: row.is_muted ?? false,
      isPinned: row.is_pinned ?? false,
      shadowMuted: row.shadow_muted ?? false,
      lastReadMessageId: row.last_read_message_id ?? null,
      lastReadAt: row.last_read_at ?? null,
      accessLevel: 'member',
    }

    const lastMessage = row.last_message_id
      ? {
          id: row.last_message_id,
          body: row.last_message_body ?? '',
          senderId: row.last_message_sender_id ?? null,
          createdAt: row.last_message_created_at ?? new Date(0),
          metadata: row.last_message_metadata ?? {},
        }
      : undefined

    entries.push({
      conversation: descriptor,
      membership,
      unreadCount: Number(row.unread_count ?? 0),
      lastMessage,
    })
  }

  return entries
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
}
