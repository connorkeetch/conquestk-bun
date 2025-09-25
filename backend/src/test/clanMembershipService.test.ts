import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { logClanActivity } from '../services/clanActivityService'
import {
  ClanMembershipServiceError,
  clanMembershipService,
} from '../services/clanMembershipService'

const mockQuery = jest.fn()
const mockTransaction = jest.fn()

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args),
}))

jest.mock('../services/clanActivityService', () => ({
  logClanActivity: jest.fn().mockResolvedValue(undefined),
}))

describe('ClanMembershipService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery.mockReset()
    mockTransaction.mockReset()
    ;(logClanActivity as jest.Mock).mockReset()
  })

  describe('applyToClan', () => {
    it('creates a pending application when user is eligible', async () => {
      const mockClient = {
        query: jest.fn(),
      }

      mockTransaction.mockImplementation(
        async (callback: (client: typeof mockClient) => Promise<unknown>) => {
          return callback(mockClient)
        },
      )

      const createdAt = new Date().toISOString()

      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ recruitment_status: 'active', recruitment_policy: 'application' }],
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'application-1',
              clan_id: 'clan-1',
              user_id: 'user-2',
              status: 'pending',
              message: 'Let me in',
              created_at: createdAt,
              updated_at: createdAt,
            },
          ],
        })

      const application = await clanMembershipService.applyToClan('user-2', 'clan-1', 'Let me in')

      expect(mockTransaction).toHaveBeenCalledTimes(1)
      expect(application.status).toBe('pending')
      expect(logClanActivity).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'application_submitted' }),
      )
    })

    it('throws when clan is closed to recruitment', async () => {
      const mockClient = {
        query: jest.fn(),
      }

      mockTransaction.mockImplementation(
        async (callback: (client: typeof mockClient) => Promise<unknown>) => {
          return callback(mockClient)
        },
      )

      mockClient.query.mockResolvedValueOnce({
        rows: [{ recruitment_status: 'closed', recruitment_policy: 'application' }],
      })

      await expect(clanMembershipService.applyToClan('user-3', 'clan-2')).rejects.toThrow(
        ClanMembershipServiceError,
      )
    })
  })

  describe('reviewApplication', () => {
    it('approves an application and activates membership', async () => {
      const mockClient = {
        query: jest.fn(),
      }

      mockTransaction.mockImplementation(
        async (callback: (client: typeof mockClient) => Promise<unknown>) => {
          return callback(mockClient)
        },
      )

      const timestamp = new Date().toISOString()

      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'application-1',
              clan_id: 'clan-1',
              user_id: 'user-5',
              status: 'pending',
              message: null,
              created_at: timestamp,
              updated_at: timestamp,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              status: 'active',
              permissions: { manage_applications: true },
              clan_id: 'clan-1',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'application-1',
              clan_id: 'clan-1',
              user_id: 'user-5',
              status: 'accepted',
              created_at: timestamp,
              updated_at: timestamp,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'role-member' }] })
        .mockResolvedValueOnce({ rows: [] })

      const result = await clanMembershipService.reviewApplication(
        'reviewer-1',
        'clan-1',
        'application-1',
        'accepted',
      )

      expect(result.status).toBe('accepted')
      expect(logClanActivity).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'member_joined', clanId: 'clan-1' }),
      )
    })
  })
})
