import type { PoolClient } from 'pg'
import { query, transaction } from '../config/database'
import { logger } from '../utils/logger'
import {
  MessagingPolicyError,
  assertCanInviteToGroup,
  assertCanSendDirectMessage,
  assertCanStartDirectConversation,
} from './messagingPolicyService'
import { tryGetSocketServer } from './socketRegistry'

export const MAX_MESSAGE_LENGTH = 2000
export const MAX_GROUP_MEMBERS = 50

export type ConversationKind = 'direct' | 'group' | 'game'

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
  metadata: Record<string, unknown>
}

export interface ConversationMemberRole {
  userId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: Date
  shadowMuted: boolean
}

export interface ConversationWithMembers extends ConversationRecord {
  memberIds: string[]
  memberRoles: ConversationMemberRole[]
}

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

export class ConversationError extends Error {
  code: string

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
  metadata: Record<string, unknown> | null
}

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

type ConversationMemberRow = {
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: Date
  shadow_muted: boolean | null
}

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
  metadata: row.metadata ?? {},
})

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

const getConversationMemberRoles = async (
  conversationId: string,
): Promise<ConversationMemberRole[]> => {
  const result = await query<ConversationMemberRow>(
    `
    SELECT user_id, role, joined_at, shadow_muted
    FROM conversation_members
    WHERE conversation_id = $1
    ORDER BY joined_at ASC
  `,
    [conversationId],
  )

  return result.rows.map((row) => ({
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    shadowMuted: row.shadow_muted ?? false,
  }))
}

const buildConversationDescriptor = async (
  conversation: ConversationRecord,
): Promise<ConversationWithMembers> => {
  const memberRoles = await getConversationMemberRoles(conversation.id)
  const memberIds = memberRoles.map((member) => member.userId)

  return {
    ...conversation,
    memberIds,
    memberRoles,
  }
}

const handlePolicyError = (error: unknown): never => {
  if (error instanceof MessagingPolicyError) {
    throw new ConversationError(error.code, error.message)
  }
  throw error
}

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

const normalizeGroupTitle = (title?: string | null): string | null => {
  if (!title) return null
  const trimmed = title.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > 120) {
    throw new ConversationError('INVALID_TITLE', 'Group titles must be 120 characters or fewer')
  }
  return trimmed
}

const normalizeMetadata = (metadata?: Record<string, unknown>): string => {
  if (!metadata) {
    return '{}'
  }
  try {
    return JSON.stringify(metadata)
  } catch (_error) {
    throw new ConversationError('INVALID_METADATA', 'Conversation metadata must be JSON serializable')
  }
}

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
    throw new ConversationError('NOT_ENOUGH_MEMBERS', 'Group conversations require at least two members')
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

export async function addMembersToConversation(
  options: AddConversationMembersOptions,
): Promise<ConversationMemberRole[]> {
  const { actorId, conversationId } = options
  const requestedIds = Array.from(
    new Set((options.memberIds ?? []).filter((id) => typeof id === 'string' && id && id !== actorId)),
  )

  if (requestedIds.length === 0) {
    return []
  }

  const conversation = await getConversationRow(conversationId)
  if (conversation.kind !== 'group') {
    throw new ConversationError('INVALID_OPERATION', 'Members can only be added to group conversations')
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

const ensureMembership = async (
  conversationId: string,
  userId: string,
): Promise<{ role: string; shadowMuted: boolean }> => {
  const membershipResult = await query(
    `
    SELECT role, shadow_muted
    FROM conversation_members
    WHERE conversation_id = $1 AND user_id = $2
  `,
    [conversationId, userId],
  )

  if (membershipResult.rows.length === 0) {
    throw new ConversationError('NOT_MEMBER', 'User is not a member of this conversation')
  }

  const row = membershipResult.rows[0]
  return { role: row.role, shadowMuted: row.shadow_muted ?? false }
}

const getConversationRow = async (conversationId: string): Promise<ConversationRecord> => {
  const result = await query(`SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE id = $1`, [
    conversationId,
  ])

  if (result.rows.length === 0) {
    throw new ConversationError('NOT_FOUND', 'Conversation not found')
  }

  return mapConversationRow(result.rows[0])
}

const getOtherDirectMember = async (
  conversationId: string,
  senderId: string,
): Promise<string | null> => {
  const result = await query(
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

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value

const serializeConversationForEvent = (conversation: ConversationRecord) => ({
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
})

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
      members: conversation.memberRoles.map(({ userId, role }) => ({ userId, role })),
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
      members: addedMembers.map(({ userId, role }) => ({ userId, role })),
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

export interface SendMessageOptions {
  conversationId: string
  senderId: string
  body: string
  clientMessageId?: string
  metadata?: Record<string, unknown>
}

export interface CreateGroupConversationOptions {
  creatorId: string
  title?: string | null
  memberIds: string[]
  metadata?: Record<string, unknown>
}

export interface AddConversationMembersOptions {
  actorId: string
  conversationId: string
  memberIds: string[]
}

export async function sendMessage(options: SendMessageOptions): Promise<ConversationMessageRecord> {
  const { conversationId, senderId, body, clientMessageId, metadata } = options

  const trimmed = body?.trim()
  if (!trimmed) {
    throw new ConversationError('EMPTY_MESSAGE', 'Message body is required')
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new ConversationError('MESSAGE_TOO_LONG', 'Message exceeds the allowed length')
  }

  const conversation = await getConversationRow(conversationId)
  await ensureMembership(conversationId, senderId)

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

  if (clientMessageId) {
    const existing = await query(
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

  const jsonMetadata = {
    ...(metadata ?? {}),
    ...(clientMessageId ? { clientMessageId } : {}),
  }

  const insertResult = await query(
    `
    INSERT INTO conversation_messages (conversation_id, sender_id, body, json_metadata)
    VALUES ($1, $2, $3, $4::jsonb)
    RETURNING *
  `,
    [conversationId, senderId, trimmed, JSON.stringify(jsonMetadata)],
  )

  const message = mapMessageRow(insertResult.rows[0])

  await query(
    `
    UPDATE conversation_members
    SET last_read_message_id = $1,
        last_read_at = NOW()
    WHERE conversation_id = $2 AND user_id = $3
  `,
    [message.id, conversationId, senderId],
  )

  return message
}

export async function listMessages(
  conversationId: string,
  userId: string,
  limit = 50,
  before?: string,
): Promise<ConversationMessageRecord[]> {
  if (limit <= 0 || limit > 100) {
    throw new ConversationError('INVALID_PAGINATION', 'Limit must be between 1 and 100')
  }

  await ensureMembership(conversationId, userId)

  const params: Array<string | number> = [conversationId]
  let cursorClause = ''

  if (before) {
    params.push(before)
    cursorClause = 'AND id < $2'
  }

  params.push(limit)

  const result = await query(
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

export default {
  ensureDirectConversation,
  createGroupConversation,
  addMembersToConversation,
  sendMessage,
  listMessages,
}
