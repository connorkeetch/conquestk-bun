import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { logClanActivity } from '../services/clanActivityService'
import { clanProgressionService } from '../services/clanProgressionService'

const mockQuery = jest.fn()
const mockTransaction = jest.fn()

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args),
}))

jest.mock('../services/clanActivityService', () => ({
  logClanActivity: jest.fn().mockResolvedValue(undefined),
}))

describe('ClanProgressionService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery.mockReset()
    mockTransaction.mockReset()
    ;(logClanActivity as jest.Mock).mockReset()
  })

  describe('getProgressionSummary', () => {
    it('computes derived progression values from clan XP', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total_xp: 2600, level: 3 }] })

      const summary = await clanProgressionService.getProgressionSummary('clan-7')

      expect(mockQuery).toHaveBeenCalledWith('SELECT total_xp FROM clans WHERE id = $1', ['clan-7'])
      expect(summary.level).toBe(3)
      expect(summary.totalXp).toBe(2600)
      expect(summary.currentLevelXp).toBe(2500)
      expect(summary.nextLevelXp).toBe(4500)
      expect(summary.xpIntoLevel).toBe(100)
      expect(summary.xpToNextLevel).toBe(2000)
      expect(summary.progressPercent).toBeCloseTo(0.05, 5)
    })
  })

  describe('awardContribution', () => {
    it('increments clan XP, levels up, and advances active objectives', async () => {
      const mockClient = { query: jest.fn() }
      const now = new Date('2025-10-01T00:00:00.000Z')

      mockTransaction.mockImplementation(
        async (callback: (client: typeof mockClient) => Promise<unknown>) => {
          return callback(mockClient)
        },
      )

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ total_xp: 1000, level: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'member-1', status: 'active' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'obj-1',
              clan_id: 'clan-1',
              objective_type: 'earn_xp',
              target_value: 3000,
              progress_value: 2000,
              start_at: now,
              end_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
              reward: {},
            },
            {
              id: 'obj-2',
              clan_id: 'clan-1',
              objective_type: 'play_matches',
              target_value: 5,
              progress_value: 3,
              start_at: now,
              end_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
              reward: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })

      const result = await clanProgressionService.awardContribution({
        clanId: 'clan-1',
        userId: 'user-5',
        actorUserId: 'user-5',
        xp: 1500,
        matchesPlayed: 2,
        matchesWon: 1,
        source: 'match_victory',
        now,
      })

      expect(mockTransaction).toHaveBeenCalledTimes(1)
      expect(mockClient.query).toHaveBeenCalled()
      expect(result.level).toBe(3)
      expect(result.leveledUp).toBe(true)
      expect(result.totalXp).toBe(2500)
      expect(result.progression.level).toBe(3)
      expect(result.objectiveUpdates).toEqual([
        { objectiveId: 'obj-1', progressValue: 3000, completed: true },
        { objectiveId: 'obj-2', progressValue: 5, completed: true },
      ])
      expect(logClanActivity).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'clan_xp_awarded', clanId: 'clan-1' }),
      )
      expect(logClanActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'clan_level_up',
          metadata: { fromLevel: 2, toLevel: 3 },
        }),
      )
      expect(logClanActivity).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'clan_objective_completed', targetId: 'obj-1' }),
      )
      expect(logClanActivity).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'clan_objective_completed', targetId: 'obj-2' }),
      )
    })
  })

  describe('ensureWeeklyObjectives', () => {
    it('creates a fresh objective rotation when none are active', async () => {
      const mockClient = { query: jest.fn() }
      const now = new Date('2025-10-06T12:00:00.000Z')

      mockTransaction.mockImplementation(
        async (callback: (client: typeof mockClient) => Promise<unknown>) => {
          return callback(mockClient)
        },
      )

      const windowStart = new Date(now)
      windowStart.setUTCHours(0, 0, 0, 0)
      const windowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000)

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'obj-10',
              clan_id: 'clan-9',
              objective_type: 'earn_xp',
              target_value: 5000,
              progress_value: 0,
              start_at: windowStart,
              end_at: windowEnd,
              reward: JSON.stringify({ bonus_xp: 500 }),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'obj-11',
              clan_id: 'clan-9',
              objective_type: 'play_matches',
              target_value: 10,
              progress_value: 0,
              start_at: windowStart,
              end_at: windowEnd,
              reward: JSON.stringify({ crest_tokens: 5 }),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'obj-12',
              clan_id: 'clan-9',
              objective_type: 'win_matches',
              target_value: 5,
              progress_value: 0,
              start_at: windowStart,
              end_at: windowEnd,
              reward: JSON.stringify({ banner_fragment: 1 }),
            },
          ],
        })

      const objectives = await clanProgressionService.ensureWeeklyObjectives('clan-9', now)

      expect(mockTransaction).toHaveBeenCalledTimes(1)
      expect(mockClient.query).toHaveBeenCalledTimes(4)
      expect(objectives).toHaveLength(3)
      expect(objectives.map((objective) => objective.clanId)).toEqual([
        'clan-9',
        'clan-9',
        'clan-9',
      ])
      expect(logClanActivity).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'clan_objectives_rotated', clanId: 'clan-9' }),
      )
    })
  })
})
