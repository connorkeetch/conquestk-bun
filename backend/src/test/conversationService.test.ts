process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://tester:tester@localhost:5432/risk_game_test'

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockQuery = jest.fn()
jest.mock('../config/database', () => ({
  __esModule: true,
  query: mockQuery,
  transaction: jest.fn(),
}))

type MockTransactionClient = {
  query: jest.Mock
}

type TransactionHandler<T = unknown> = (client: MockTransactionClient) => Promise<T>

const mockAssertCanInviteToGroup = jest.fn()
const mockAssertCanSendDirectMessage = jest.fn()
const mockAssertCanStartDirectConversation = jest.fn()

class MockMessagingPolicyError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'MessagingPolicyError'
  }
}

jest.mock('../services/messagingPolicyService', () => ({
  __esModule: true,
  MessagingPolicyError: MockMessagingPolicyError,
  assertCanInviteToGroup: mockAssertCanInviteToGroup,
  assertCanSendDirectMessage: mockAssertCanSendDirectMessage,
  assertCanStartDirectConversation: mockAssertCanStartDirectConversation,
}))

const mockToEmit = jest.fn()
const mockIo = {
  to: jest.fn(() => ({ emit: mockToEmit })),
}

jest.mock('../services/socketRegistry', () => ({
  __esModule: true,
  tryGetSocketServer: jest.fn(() => mockIo),
}))

const databaseModule = require('../config/database') as { transaction: jest.Mock }
databaseModule.transaction.mockImplementation(async (handler: TransactionHandler) => {
  const client = { query: jest.fn() }
  return handler(client)
})

const {
  addMembersToConversation,
  createGroupConversation,
  ensureDirectConversation,
  listConversationsForUser,
  getConversationDetail,
  getUnreadSummary,
  markConversationRead,
  leaveConversation,
  removeConversationMember,
  sendMessage,
} = require('../services/conversationService') as typeof import('../services/conversationService')

const socketRegistryModule = require('../services/socketRegistry') as {
  tryGetSocketServer: jest.Mock
}

const resetMocks = () => {
  mockQuery.mockReset()
  databaseModule.transaction.mockReset()
  databaseModule.transaction.mockImplementation(async (handler: TransactionHandler) => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
    return handler(client)
  })
  mockAssertCanInviteToGroup.mockReset()
  mockAssertCanSendDirectMessage.mockReset()
  mockAssertCanStartDirectConversation.mockReset()
  mockToEmit.mockReset()
  mockIo.to.mockClear()
  socketRegistryModule.tryGetSocketServer.mockReturnValue(mockIo)
}

describe('conversationService', () => {
  beforeEach(() => {
    resetMocks()
  })

  it('creates a group conversation and emits events', async () => {
    mockAssertCanInviteToGroup.mockResolvedValue(undefined)

    const createdAt = new Date('2025-09-20T12:00:00Z')
    const updatedAt = new Date('2025-09-20T12:00:00Z')

    databaseModule.transaction.mockImplementationOnce(async (handler: TransactionHandler) => {
      const clientQuery = jest.fn()
      clientQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'conv-1',
              kind: 'group',
              title: 'Test Group',
              created_by: 'creator',
              created_at: createdAt,
              updated_at: updatedAt,
              is_archived: false,
              is_read_only: false,
              game_id: null,
              metadata: {},
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValue({ rows: [], rowCount: 1 })

      await handler({ query: clientQuery })
      return {
        id: 'conv-1',
        kind: 'group',
        title: 'Test Group',
        createdBy: 'creator',
        createdAt,
        updatedAt,
        isArchived: false,
        isReadOnly: false,
        gameId: null,
        metadata: {},
      }
    })

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'creator',
          role: 'owner',
          joined_at: createdAt,
          shadow_muted: false,
        },
        {
          user_id: 'member-1',
          role: 'member',
          joined_at: createdAt,
          shadow_muted: false,
        },
      ],
      rowCount: 2,
    })

    const conversation = await createGroupConversation({
      creatorId: 'creator',
      title: 'Test Group',
      memberIds: ['member-1'],
      metadata: { topic: 'strategy' },
    })

    expect(conversation.memberIds).toEqual(['creator', 'member-1'])
    expect(mockAssertCanInviteToGroup).toHaveBeenCalledWith('creator', 'member-1')
    expect(mockIo.to).toHaveBeenCalledWith('user:creator')
    expect(mockIo.to).toHaveBeenCalledWith('user:member-1')
  })

  it('maps policy errors to ConversationError during group creation', async () => {
    const policyError = new MockMessagingPolicyError('BLOCKED', 'blocked user')
    mockAssertCanInviteToGroup.mockRejectedValue(policyError)

    await expect(
      createGroupConversation({
        creatorId: 'creator',
        title: 'Blocked Group',
        memberIds: ['member-1'],
      }),
    ).rejects.toMatchObject({ code: 'BLOCKED' })
  })

  it('sends direct messages and emits conversation.message.new', async () => {
    mockAssertCanSendDirectMessage.mockResolvedValue(undefined)

    const createdAt = new Date('2025-09-20T12:00:00Z')

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-1',
            kind: 'direct',
            title: null,
            created_by: 'sender',
            created_at: createdAt,
            updated_at: createdAt,
            is_archived: false,
            is_read_only: false,
            game_id: null,
            metadata: {},
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ role: 'member', shadow_muted: false }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ user_id: 'recipient' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'sender',
            role: 'owner',
            joined_at: createdAt,
            shadow_muted: false,
          },
          {
            user_id: 'recipient',
            role: 'member',
            joined_at: createdAt,
            shadow_muted: false,
          },
        ],
        rowCount: 2,
      })
      .mockResolvedValueOnce({
        rows: [{ username: 'sender-user' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '01HF76DK4Z1X3J6G2M8Q9N0PQS',
            conversation_id: 'conv-1',
            sender_id: 'sender',
            body: 'Hello there',
            json_metadata: {},
            created_at: createdAt,
            updated_at: createdAt,
            deleted_at: null,
            edited_at: null,
            shadow_muted: false,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })

    const message = await sendMessage({
      conversationId: 'conv-1',
      senderId: 'sender',
      body: 'Hello there',
    })

    expect(message.body).toBe('Hello there')
    expect(mockAssertCanSendDirectMessage).toHaveBeenCalledWith('sender', 'recipient')
    expect(mockIo.to).toHaveBeenCalledWith('conversation:conv-1')
    expect(mockIo.to).toHaveBeenCalledWith('user:sender')
    expect(mockIo.to).toHaveBeenCalledWith('user:recipient')
  })

  it('lists conversations for a user with unread counts', async () => {
    const updatedAt = new Date('2025-09-22T10:00:00Z')
    const joinedAt = new Date('2025-09-21T15:00:00Z')
    const lastReadAt = new Date('2025-09-21T16:00:00Z')
    const lastMessageAt = new Date('2025-09-22T09:55:00Z')

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-42',
            kind: 'group',
            title: 'Strategy Room',
            created_by: 'owner-id',
            created_at: joinedAt,
            updated_at: updatedAt,
            is_archived: false,
            is_read_only: false,
            game_id: null,
            metadata: { topic: 'war room' },
            role: 'admin',
            joined_at: joinedAt,
            is_muted: false,
            is_pinned: true,
            shadow_muted: false,
            last_read_message_id: 'msg-1',
            last_read_at: lastReadAt,
            unread_count: 3,
            last_message_id: 'msg-3',
            last_message_body: 'Final rally call',
            last_message_created_at: lastMessageAt,
            last_message_sender_id: 'ally',
            last_message_metadata: { clientMessageId: 'abc123' },
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user-1',
            role: 'admin',
            joined_at: joinedAt,
            shadow_muted: false,
          },
          {
            user_id: 'ally',
            role: 'member',
            joined_at: joinedAt,
            shadow_muted: false,
          },
        ],
        rowCount: 2,
      })

    const result = await listConversationsForUser('user-1', { limit: 10, offset: 0 })

    expect(result.length).toBe(1)
    expect(result[0].unreadCount).toBe(3)
    expect(result[0].conversation.id).toBe('conv-42')
    expect(result[0].membership.isPinned).toBe(true)
    expect(result[0].lastMessage?.body).toBe('Final rally call')
  })

  it('returns conversation detail with membership and unread count', async () => {
    const joinedAt = new Date('2025-09-22T08:00:00Z')
    const updatedAt = new Date('2025-09-22T09:00:00Z')

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-99',
            kind: 'group',
            title: 'Alliance',
            created_by: 'owner-1',
            created_at: joinedAt,
            updated_at: updatedAt,
            is_archived: false,
            is_read_only: false,
            game_id: null,
            metadata: {},
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            role: 'member',
            shadow_muted: false,
            joined_at: joinedAt,
            last_read_message_id: null,
            last_read_at: null,
            is_muted: false,
            is_pinned: false,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user-7',
            role: 'member',
            joined_at: joinedAt,
            shadow_muted: false,
          },
          {
            user_id: 'ally',
            role: 'member',
            joined_at: joinedAt,
            shadow_muted: false,
          },
        ],
        rowCount: 2,
      })
      .mockResolvedValueOnce({ rows: [{ count: 4 }], rowCount: 1 })

    const detail = await getConversationDetail('conv-99', 'user-7')

    expect(detail.conversation.id).toBe('conv-99')
    expect(detail.membership.joinedAt).toEqual(joinedAt)
    expect(detail.membership.accessLevel).toBe('member')
    expect(detail.unreadCount).toBe(4)
  })

  it('allows spectators to view public game conversations', async () => {
    const createdAt = new Date('2025-09-23T10:00:00Z')

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-game',
            kind: 'game',
            title: null,
            created_by: 'host-1',
            created_at: createdAt,
            updated_at: createdAt,
            is_archived: false,
            is_read_only: false,
            game_id: 'room-1',
            metadata: {},
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ is_private: false }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            conversation_id: 'conv-game',
            user_id: 'host-1',
            role: 'owner',
            joined_at: createdAt,
            shadow_muted: false,
            username: 'HostOne',
          },
        ],
        rowCount: 1,
      })

    const detail = await getConversationDetail('conv-game', 'spectator-9', {
      allowSpectatorGameAccess: true,
    })

    expect(detail.conversation.id).toBe('conv-game')
    expect(detail.membership.accessLevel).toBe('spectator')
    expect(detail.unreadCount).toBe(0)
  })

  it('summarizes unread counts by conversation', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { conversation_id: 'conv-1', unread_count: 0 },
        { conversation_id: 'conv-2', unread_count: 5 },
      ],
      rowCount: 2,
    })

    const summary = await getUnreadSummary('user-42')

    expect(summary).toEqual([
      { conversationId: 'conv-1', unreadCount: 0 },
      { conversationId: 'conv-2', unreadCount: 5 },
    ])
  })

  it('marks conversations as read using the latest message timestamp', async () => {
    const createdAt = new Date('2025-09-23T12:00:00Z')

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-5',
            kind: 'group',
            title: 'Battle prep',
            created_by: 'leader',
            created_at: createdAt,
            updated_at: createdAt,
            is_archived: false,
            is_read_only: false,
            game_id: null,
            metadata: {},
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            role: 'member',
            shadow_muted: false,
            joined_at: createdAt,
            last_read_message_id: null,
            last_read_at: null,
            is_muted: false,
            is_pinned: false,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'msg-123',
            conversation_id: 'conv-5',
            sender_id: 'user-5',
            body: 'latest message',
            json_metadata: {},
            created_at: createdAt,
            updated_at: createdAt,
            deleted_at: null,
            edited_at: null,
            shadow_muted: false,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })

    await markConversationRead('conv-5', 'user-9')

    expect(mockQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE conversation_members'),
      ['conv-5', 'user-9', 'msg-123', createdAt],
    )
  })

  it('adds members to an existing group conversation', async () => {
    mockAssertCanInviteToGroup.mockResolvedValue(undefined)

    const updatedAt = new Date('2025-09-22T10:00:00Z')
    const joinedAt = new Date('2025-09-21T12:00:00Z')

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-55',
            kind: 'group',
            title: 'Battle Plans',
            created_by: 'owner-1',
            created_at: joinedAt,
            updated_at: updatedAt,
            is_archived: false,
            is_read_only: false,
            game_id: null,
            metadata: {},
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ role: 'admin', shadow_muted: false }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'owner-1',
            role: 'admin',
            joined_at: joinedAt,
            shadow_muted: false,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-55',
            kind: 'group',
            title: 'Battle Plans',
            created_by: 'owner-1',
            created_at: joinedAt,
            updated_at: updatedAt,
            is_archived: false,
            is_read_only: false,
            game_id: null,
            metadata: {},
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'owner-1',
            role: 'admin',
            joined_at: joinedAt,
            shadow_muted: false,
          },
          {
            user_id: 'new-user',
            role: 'member',
            joined_at: updatedAt,
            shadow_muted: false,
          },
        ],
        rowCount: 2,
      })

    databaseModule.transaction.mockImplementationOnce(async (handler: TransactionHandler) => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 })
      return handler({ query: clientQuery })
    })

    const added = await addMembersToConversation({
      actorId: 'owner-1',
      conversationId: 'conv-55',
      memberIds: ['new-user'],
    })

    expect(added).toHaveLength(1)
    expect(added[0].userId).toBe('new-user')
    expect(mockAssertCanInviteToGroup).toHaveBeenCalledWith('owner-1', 'new-user')
    expect(mockIo.to).toHaveBeenCalledWith('user:new-user')
  })

  it('allows owners to leave after promoting next member', async () => {
    const joinedAt = new Date('2025-09-22T08:00:00Z')

    databaseModule.transaction.mockImplementationOnce(async (handler: TransactionHandler) => {
      const clientQuery = jest.fn()
      clientQuery
        .mockResolvedValueOnce({
          rows: [{ user_id: 'owner-1', role: 'owner', joined_at: joinedAt, shadow_muted: false }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ user_id: 'member-2', role: 'member', joined_at: joinedAt, shadow_muted: false }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      await handler({ query: clientQuery })
    })

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-77',
            kind: 'group',
            title: 'Alliance',
            created_by: 'owner-1',
            created_at: joinedAt,
            updated_at: joinedAt,
            is_archived: false,
            is_read_only: false,
            game_id: null,
            metadata: {},
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-77',
            kind: 'group',
            title: 'Alliance',
            created_by: 'owner-1',
            created_at: joinedAt,
            updated_at: joinedAt,
            is_archived: false,
            is_read_only: false,
            game_id: null,
            metadata: {},
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ user_id: 'member-2', role: 'owner', joined_at: joinedAt, shadow_muted: false }],
        rowCount: 1,
      })

    await leaveConversation('conv-77', 'owner-1')

    expect(mockIo.to).toHaveBeenCalledWith('user:member-2')
  })

  it('allows admins to remove members', async () => {
    const joinedAt = new Date('2025-09-22T09:00:00Z')

    databaseModule.transaction.mockImplementationOnce(async (handler: TransactionHandler) => {
      const clientQuery = jest.fn()
      clientQuery
        .mockResolvedValueOnce({
          rows: [{ user_id: 'admin-1', role: 'admin', joined_at: joinedAt, shadow_muted: false }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ user_id: 'member-3', role: 'member', joined_at: joinedAt, shadow_muted: false }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      await handler({ query: clientQuery })
    })

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-88',
            kind: 'group',
            title: 'War Room',
            created_by: 'owner-2',
            created_at: joinedAt,
            updated_at: joinedAt,
            is_archived: false,
            is_read_only: false,
            game_id: null,
            metadata: {},
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'conv-88',
            kind: 'group',
            title: 'War Room',
            created_by: 'owner-2',
            created_at: joinedAt,
            updated_at: joinedAt,
            is_archived: false,
            is_read_only: false,
            game_id: null,
            metadata: {},
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          { user_id: 'admin-1', role: 'admin', joined_at: joinedAt, shadow_muted: false },
          { user_id: 'owner-2', role: 'owner', joined_at: joinedAt, shadow_muted: false },
        ],
        rowCount: 2,
      })

    await removeConversationMember({
      actorId: 'admin-1',
      conversationId: 'conv-88',
      targetUserId: 'member-3',
    })

    expect(mockIo.to).toHaveBeenCalledWith('user:owner-2')
  })

  it('propagates policy errors from ensureDirectConversation', async () => {
    const policyError = new MockMessagingPolicyError('DM_POLICY', 'not allowed')
    mockAssertCanStartDirectConversation.mockRejectedValue(policyError)

    await expect(ensureDirectConversation('user-a', 'user-b')).rejects.toMatchObject({
      code: 'DM_POLICY',
    })
  })
})
