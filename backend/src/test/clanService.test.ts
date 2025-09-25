import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { logClanActivity } from '../services/clanActivityService'
import { clanService } from '../services/clanService'

const mockQuery = jest.fn()
const mockTransaction = jest.fn()
const mockGetProgressionSummary = jest.fn()
const mockEnsureWeeklyObjectives = jest.fn()

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args),
}))

jest.mock('../services/clanActivityService', () => ({
  logClanActivity: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../services/clanProgressionService', () => ({
  clanProgressionService: {
    getProgressionSummary: (...args: unknown[]) => mockGetProgressionSummary(...args),
    ensureWeeklyObjectives: (...args: unknown[]) => mockEnsureWeeklyObjectives(...args),
  },
}))

describe('ClanService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery.mockReset()
    mockTransaction.mockReset()
    ;(logClanActivity as jest.Mock).mockReset()
    mockGetProgressionSummary.mockReset()
    mockEnsureWeeklyObjectives.mockReset()
  })

  describe('createClan', () => {
    it('creates a clan with default roles and returns hydrated details', async () => {
      const clanId = 'clan-123'
      const ownerId = 'user-1'
      const mockClient = {
        query: jest.fn(),
      }

      mockTransaction.mockImplementation(
        async (callback: (client: typeof mockClient) => Promise<unknown>) => {
          return callback(mockClient)
        },
      )

      mockClient.query
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: clanId,
              owner_user_id: ownerId,
              name: 'Test Clan',
              tag: 'TC',
              slug: 'test-clan',
              recruitment_policy: 'application',
              recruitment_status: 'active',
              auto_accept_thresholds: {},
              privacy: 'public',
              total_xp: 0,
              level: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'role-leader' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'role-officer' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'role-member' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'role-recruit' }] })
        .mockResolvedValueOnce({ rows: [] })

      const progression = {
        clanId,
        totalXp: 0,
        level: 1,
        currentLevelXp: 0,
        nextLevelXp: 1000,
        xpIntoLevel: 0,
        xpToNextLevel: 1000,
        progressPercent: 0,
      }

      mockGetProgressionSummary.mockResolvedValue(progression)
      mockEnsureWeeklyObjectives.mockResolvedValue([])

      const createdAt = new Date().toISOString()

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: clanId,
              owner_user_id: ownerId,
              name: 'Test Clan',
              tag: 'TC',
              slug: 'test-clan',
              recruitment_policy: 'application',
              recruitment_status: 'active',
              auto_accept_thresholds: {},
              privacy: 'public',
              total_xp: 0,
              level: 1,
              created_at: createdAt,
              updated_at: createdAt,
              member_count: 1,
              owner_username: 'Commander',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'member-1',
              clan_id: clanId,
              user_id: ownerId,
              role_id: 'role-leader',
              status: 'active',
              joined_at: createdAt,
              contribution_xp: 0,
              contribution_matches: 0,
              username: 'Commander',
              avatar_url: null,
              role_name: 'Leader',
              hierarchy_rank: 100,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'announcement-1',
              clan_id: clanId,
              author_user_id: ownerId,
              title: 'Welcome',
              body_markdown: 'Hello world',
              pinned: false,
              created_at: createdAt,
              updated_at: createdAt,
              expires_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      const result = await clanService.createClan(ownerId, { name: 'Test Clan', tag: 'tc' })

      expect(mockTransaction).toHaveBeenCalledTimes(1)
      expect(mockClient.query).toHaveBeenCalled()
      expect(logClanActivity).toHaveBeenCalledWith(
        expect.objectContaining({ clanId, actorUserId: ownerId, actionType: 'clan_created' }),
      )
      expect(mockGetProgressionSummary).toHaveBeenCalledWith(clanId)
      expect(mockEnsureWeeklyObjectives).toHaveBeenCalledWith(clanId)
      expect(result.slug).toBe('test-clan')
      expect(result.members).toHaveLength(1)
      expect(result.recentAnnouncements[0].title).toBe('Welcome')
      expect(result.progression).toEqual(progression)
      expect(result.activeObjectives).toEqual([])
      expect(result.recentActivity).toEqual([])
    })
  })

  describe('listClans', () => {
    it('returns clans with pagination cursor', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'clan-a',
            owner_user_id: 'user-1',
            name: 'Alpha',
            tag: 'ALP',
            slug: 'alpha',
            recruitment_policy: 'open',
            recruitment_status: 'active',
            auto_accept_thresholds: {},
            privacy: 'public',
            total_xp: 100,
            level: 2,
            created_at: '2025-09-25T00:00:00.000Z',
            updated_at: '2025-09-25T00:00:00.000Z',
            member_count: 5,
          },
        ],
      })

      const result = await clanService.listClans({ limit: 10 })
      expect(mockQuery).toHaveBeenCalled()
      expect(result.clans[0].name).toBe('Alpha')
    })
  })

  describe('getActiveMembershipsForUsers', () => {
    it('returns a map of active memberships keyed by user id', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user-1',
            clan_id: 'clan-1',
            clan_slug: 'clan-one',
            clan_name: 'Clan One',
            status: 'active',
            role_name: 'Member',
          },
          {
            user_id: 'user-2',
            clan_id: 'clan-2',
            clan_slug: 'clan-two',
            clan_name: 'Clan Two',
            status: 'active',
            role_name: null,
          },
        ],
      })

      const map = await clanService.getActiveMembershipsForUsers([
        'user-1',
        'user-2',
        'user-1',
        '',
        '   ',
      ])

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM clan_members m'), [
        expect.arrayContaining(['user-1', 'user-2']),
      ])
      expect(map.size).toBe(2)
      expect(map.get('user-1')).toEqual({
        clanId: 'clan-1',
        clanSlug: 'clan-one',
        clanName: 'Clan One',
        roleName: 'Member',
        status: 'active',
      })
      expect(map.get('user-2')).toEqual({
        clanId: 'clan-2',
        clanSlug: 'clan-two',
        clanName: 'Clan Two',
        roleName: null,
        status: 'active',
      })
    })

    it('returns an empty map when no valid user ids provided', async () => {
      const map = await clanService.getActiveMembershipsForUsers(['', '   '])
      expect(mockQuery).not.toHaveBeenCalled()
      expect(map.size).toBe(0)
    })
  })
})
