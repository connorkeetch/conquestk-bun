import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import type { PoolClient } from 'pg'

type SeedUser = {
  id: string
  username: string
  skill_rating: number
}

type SeedPlayerStats = {
  user_id: string
  games_played: number
  games_won: number
}

const users = new Map<string, SeedUser>()
const stats = new Map<string, SeedPlayerStats>()

const fakeClient = {
  query: jest.fn(async (sql: string) => {
    if (sql.includes('FROM users u')) {
      expect(sql).not.toContain('avatar_url')
      expect(sql).not.toContain('up.level')

      const rows = Array.from(users.values())
        .map((user) => {
          const stat = stats.get(user.id)
          if (!stat || stat.games_played < 5) {
            return null
          }

          const winRate = stat.games_played > 0 ? (stat.games_won * 100) / stat.games_played : 0

          return {
            user_id: user.id,
            username: user.username,
            skill_rating: user.skill_rating,
            games_won: stat.games_won,
            games_played: stat.games_played,
            win_rate: winRate,
            rating: user.skill_rating + stat.games_won * 5,
          }
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)

      return { rows, rowCount: rows.length }
    }

    throw new Error(`Unexpected SQL in test double: ${sql}`)
  }),
}

const mockWithClient = jest.fn(
  async (callback: (client: PoolClient) => Promise<unknown>): Promise<unknown> =>
    await callback(fakeClient as unknown as PoolClient),
)

jest.mock('../config/database', () => ({
  withClient: (callback: (client: PoolClient) => Promise<unknown>) => mockWithClient(callback),
}))

import { profileService } from '../services/profileService.js'

describe('profileService.getLeaderboard', () => {
  beforeEach(() => {
    users.clear()
    stats.clear()
    fakeClient.query.mockClear()
    mockWithClient.mockClear()
    mockWithClient.mockImplementation(
      async (callback: (client: PoolClient) => Promise<unknown>): Promise<unknown> =>
        await callback(fakeClient as unknown as PoolClient),
    )
  })

  const seedUser = (user: SeedUser) => {
    users.set(user.id, user)
  }

  const seedStats = (stat: SeedPlayerStats) => {
    stats.set(stat.user_id, stat)
  }

  it('returns leaderboard rows when player stats are present', async () => {
    seedUser({ id: 'user-1', username: 'Alpha', skill_rating: 1350 })
    seedUser({ id: 'user-2', username: 'Bravo', skill_rating: 1280 })
    seedUser({ id: 'user-3', username: 'Charlie', skill_rating: 1100 })

    seedStats({ user_id: 'user-1', games_played: 20, games_won: 12 })
    seedStats({ user_id: 'user-2', games_played: 15, games_won: 9 })
    seedStats({ user_id: 'user-3', games_played: 4, games_won: 3 })

    const leaderboard = await profileService.getLeaderboard(10)

    expect(fakeClient.query).toHaveBeenCalledTimes(1)
    const [sql] = fakeClient.query.mock.calls[0]
    expect(sql).not.toContain('avatar_url')
    expect(sql).not.toContain('up.level')

    expect(leaderboard).toHaveLength(2)
    expect(leaderboard[0]).toMatchObject({
      userId: 'user-1',
      username: 'Alpha',
      avatarUrl: undefined,
      level: Math.max(1, Math.floor(1350 / 100)),
    })
    expect(leaderboard[0].rating).toBeGreaterThan(leaderboard[1].rating)
    expect(leaderboard[1]).toMatchObject({ userId: 'user-2', gamesPlayed: 15, gamesWon: 9 })
  })
})
