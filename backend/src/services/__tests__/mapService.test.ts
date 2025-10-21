import { query } from '../../config/database.js'
import { MapService } from '../mapService.js'

type MockedQuery = jest.MockedFunction<typeof query>

jest.mock('../../config/database.js', () => ({
  query: jest.fn(),
}))

describe('MapService.validateCapitalTerritories', () => {
  let mapService: MapService
  let mockQuery: MockedQuery

  beforeEach(() => {
    mapService = new MapService()
    mockQuery = query as MockedQuery
    mockQuery.mockReset()
  })

  it('returns valid when capitals exist and are not adjacent', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: '1' }, { id: '2' }, { id: '3' }],
        rowCount: 3,
      })
      .mockResolvedValueOnce({
        rows: [
          { from_id: '1', to_id: '2' },
          { from_id: '2', to_id: '3' },
        ],
        rowCount: 2,
      })

    const result = await mapService.validateCapitalTerritories('map-1', {
      '2': [1, 3],
    })

    expect(result).toEqual({ valid: true })
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })

  it('rejects configurations where capitals are adjacent', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: '1' }, { id: '2' }],
        rowCount: 2,
      })
      .mockResolvedValueOnce({
        rows: [{ from_id: '1', to_id: '2' }],
        rowCount: 1,
      })

    const result = await mapService.validateCapitalTerritories('map-1', {
      '2': [1, 2],
    })

    expect(result.valid).toBe(false)
    expect(result.error).toContain('are adjacent')
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })
})
