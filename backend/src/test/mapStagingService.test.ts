import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

let mockQuery: jest.Mock
const mockCreateNotification = jest.fn()
const mockGetActiveAdmins = jest.fn().mockResolvedValue(['admin-1'])

jest.mock('../config/database', () => {
  mockQuery = jest.fn()
  return {
    query: (...args: unknown[]) => mockQuery(...args),
  }
})

jest.mock('../services/notificationService', () => ({
  __esModule: true,
  default: {
    createInAppNotification: (...args: unknown[]) => mockCreateNotification(...args),
  },
}))

jest.mock('../services/adminService', () => ({
  adminService: {
    getActiveAdminUserIds: (...args: unknown[]) => mockGetActiveAdmins(...args),
  },
}))

describe('mapStagingService', () => {
  let mapStagingService: typeof import('../services/mapStagingService').mapStagingService
  let tempDir: string

  beforeEach(() => {
    jest.resetModules()
    mockCreateNotification.mockReset()
    mockGetActiveAdmins.mockResolvedValue(['admin-1'])

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-'))
    process.env.MAP_UPLOADS_DIR = tempDir

    // Reload service after setting env
    ;({ mapStagingService } = require('../services/mapStagingService'))
    mockQuery.mockReset()
  })

  it('purges deleted images and records metrics', async () => {
    const filename = 'map-test.png'
    const filePath = path.join(tempDir, filename)
    fs.writeFileSync(filePath, Buffer.from('mock'))

    mockQuery
      // fetch candidates
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'image-1',
            user_id: 'user-1',
            filename,
            file_size: 4,
            deletion_attempts: 0,
          },
        ],
      })
      // update row on success
      .mockResolvedValueOnce({ rowCount: 1 })
      // insert purge run
      .mockResolvedValueOnce({ rowCount: 1 })

    const summary = await mapStagingService.purgeDeletedImages({ batchSize: 10, minAgeMinutes: 0 })

    expect(summary).toEqual({ processed: 1, purged: 1, failed: 0, bytesPurged: 4 })
    expect(fs.existsSync(filePath)).toBe(false)
    expect(mockQuery).toHaveBeenCalledTimes(5)

    const [selectCall, updateCall, insertRunCall, deleteOldCall, capCall] = mockQuery.mock.calls

    expect(selectCall?.[0]).toContain('FROM map_images_staging')
    expect(updateCall?.[0]).toContain('UPDATE map_images_staging')
    expect(insertRunCall?.[0]).toContain('INSERT INTO map_asset_purge_runs')
    expect(deleteOldCall?.[0]).toContain('DELETE FROM map_asset_purge_runs')
    expect(capCall?.[0]).toContain('WITH ranked AS')
  })

  it('reclaims a soft-deleted image when file exists', async () => {
    const filename = 'reclaim.png'
    const filePath = path.join(tempDir, filename)
    fs.writeFileSync(filePath, Buffer.from('restore'))

    mockQuery
      // select staging image
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'image-2',
            user_id: 'user-1',
            filename,
            is_deleted: true,
          },
        ],
      })
      // update row to restore
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'image-2',
            user_id: 'user-1',
            filename,
            is_deleted: false,
          },
        ],
      })

    const image = await mapStagingService.reclaimStagingImage('admin-1', 'image-2')
    expect(image).toMatchObject({ id: 'image-2', is_deleted: false })
    expect(fs.existsSync(filePath)).toBe(true)
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })
})
