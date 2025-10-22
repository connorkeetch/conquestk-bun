import { query } from '../../config/database.js'
import { UserService } from '../userService.js'

type QueryMock = jest.MockedFunction<typeof query>

jest.mock('../../config/database.js', () => ({
  query: jest.fn(),
}))

describe('UserService rate limit helpers', () => {
  let service: UserService
  let queryMock: QueryMock

  beforeEach(() => {
    service = new UserService()
    queryMock = query as QueryMock
    queryMock.mockReset()
  })

  describe('getRecentVerificationAttempts', () => {
    it('returns a numeric zero when no attempts exist', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })

      const result = await service.getRecentVerificationAttempts('user-1')

      expect(result).toBe(0)
      expect(typeof result).toBe('number')
    })

    it('parses string counts into numbers for non-zero values', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })

      const result = await service.getRecentVerificationAttempts('user-2')

      expect(result).toBe(5)
      expect(typeof result).toBe('number')
    })
  })

  describe('getRecentPasswordResetAttempts', () => {
    it('returns zero when the count cannot be parsed', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: 'not-a-number' }], rowCount: 1 })

      const result = await service.getRecentPasswordResetAttempts('user-3')

      expect(result).toBe(0)
      expect(typeof result).toBe('number')
    })

    it('returns numeric counts for valid results', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })

      const result = await service.getRecentPasswordResetAttempts('user-4')

      expect(result).toBe(3)
      expect(typeof result).toBe('number')
    })
  })
})
