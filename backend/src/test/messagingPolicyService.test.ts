process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://tester:tester@localhost:5432/risk_game_test'

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../config/database', () => {
  const queryMock = jest.fn()
  return {
    __esModule: true,
    query: queryMock,
  }
})

jest.mock('../services/userBlockService', () => {
  return {
    __esModule: true,
    isBlocked: jest.fn(),
  }
})

const databaseModule = require('../config/database') as { query: jest.Mock }
const userBlockModule = require('../services/userBlockService') as { isBlocked: jest.Mock }

const { assertCanStartDirectConversation, assertCanInviteToGroup, assertCanSendDirectMessage } =
  require('../services/messagingPolicyService') as typeof import('../services/messagingPolicyService.js')

describe('messagingPolicyService', () => {
  beforeEach(() => {
    databaseModule.query.mockReset()
    userBlockModule.isBlocked.mockReset()
  })

  it('allows direct messages when policy is everyone and users are not blocked', async () => {
    userBlockModule.isBlocked.mockResolvedValue(false)
    databaseModule.query.mockResolvedValue({
      rows: [
        {
          dm_policy: 'everyone',
          allow_group_invites: true,
          show_online_status: true,
        },
      ],
      rowCount: 1,
    })

    await expect(assertCanStartDirectConversation('sender', 'recipient')).resolves.toBeUndefined()
  })

  it('rejects direct messages when users are blocked', async () => {
    userBlockModule.isBlocked.mockResolvedValue(true)

    await expect(assertCanStartDirectConversation('sender', 'recipient')).rejects.toMatchObject({
      code: 'BLOCKED',
    })
  })

  it('respects dm_policy = no_one', async () => {
    userBlockModule.isBlocked.mockResolvedValue(false)
    databaseModule.query.mockResolvedValue({
      rows: [
        {
          dm_policy: 'no_one',
          allow_group_invites: true,
          show_online_status: true,
        },
      ],
      rowCount: 1,
    })

    await expect(assertCanSendDirectMessage('user-a', 'user-b')).rejects.toMatchObject({
      code: 'DM_POLICY',
    })
  })

  it('requires friendship when dm_policy = friends_only', async () => {
    userBlockModule.isBlocked.mockResolvedValue(false)
    databaseModule.query
      .mockResolvedValueOnce({
        rows: [
          {
            dm_policy: 'friends_only',
            allow_group_invites: true,
            show_online_status: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })

    await expect(assertCanStartDirectConversation('user-a', 'user-b')).rejects.toMatchObject({
      code: 'DM_POLICY',
    })
  })

  it('rejects group invites when target has disabled invites', async () => {
    userBlockModule.isBlocked.mockResolvedValue(false)
    databaseModule.query.mockResolvedValue({
      rows: [
        {
          dm_policy: 'everyone',
          allow_group_invites: false,
          show_online_status: true,
        },
      ],
      rowCount: 1,
    })

    await expect(assertCanInviteToGroup('inviter', 'invitee')).rejects.toMatchObject({
      code: 'INVITE_BLOCKED',
    })
  })

  it('rejects group invites when inviter blocked by target', async () => {
    userBlockModule.isBlocked.mockResolvedValue(true)

    await expect(assertCanInviteToGroup('inviter', 'invitee')).rejects.toMatchObject({
      code: 'BLOCKED',
    })
  })
})
