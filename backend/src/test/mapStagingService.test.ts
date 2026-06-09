import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

let mockQuery: jest.Mock
const mockCreateNotification = jest.fn()
const mockGetActiveAdmins = jest.fn().mockResolvedValue(['admin-1'])
const mockDeleteAsset = jest.fn()
const mockLoggerError = jest.fn()
const mockLoggerWarn = jest.fn()

jest.mock('../config/database', () => {
  mockQuery = jest.fn()
  return {
    query: (...args: unknown[]) => mockQuery(...args),
  }
})

jest.mock('../utils/logger', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    info: jest.fn(),
    debug: jest.fn(),
  },
}))

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

jest.mock('../utils/assetStorage.js', () => {
  const actual = jest.requireActual(
    '../utils/assetStorage.js',
  ) as typeof import('../utils/assetStorage.js')
  return {
    ...actual,
    deleteAsset: (...args: unknown[]) => mockDeleteAsset(...args),
  }
})

describe('mapStagingService', () => {
  let mapStagingService: typeof import('../services/mapStagingService.js').mapStagingService
  let tempDir: string

  beforeEach(() => {
    mockCreateNotification.mockReset()
    mockGetActiveAdmins.mockResolvedValue(['admin-1'])
    mockLoggerError.mockReset()
    mockLoggerWarn.mockReset()

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-'))
    process.env.MAP_UPLOADS_DIR = tempDir

    mockDeleteAsset.mockReset()
    mockDeleteAsset.mockImplementation(async (...args: [string]) => {
      const [key] = args
      const relative = key.replace(/^maps\/staging\//, '')
      const target = path.join(tempDir, relative)
      try {
        await fs.promises.unlink(target)
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
          return
        }
        throw error
      }
    })

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

  it('attempts to delete the staging asset immediately after soft-delete', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          filename: 'delete-me.png',
          file_url: 'https://example.com/maps/delete-me.png',
        },
      ],
    })

    mockDeleteAsset.mockResolvedValueOnce(undefined)

    await mapStagingService.deleteStagingImage('user-1', 'image-123')

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('RETURNING filename, file_url'),
      ['image-123', 'user-1'],
    )
    expect(mockDeleteAsset).toHaveBeenCalledWith('maps/staging/delete-me.png')
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })

  it('logs a warning when immediate staging asset deletion fails but does not throw', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          filename: 'delete-fail.png',
        },
      ],
    })

    mockDeleteAsset.mockRejectedValueOnce(new Error('network timeout'))

    await expect(
      mapStagingService.deleteStagingImage('user-1', 'image-999'),
    ).resolves.toBeUndefined()

    expect(mockDeleteAsset).toHaveBeenCalledWith('maps/staging/delete-fail.png')
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Failed to delete staging asset immediately after soft-delete',
      expect.objectContaining({
        imageId: 'image-999',
        filename: 'delete-fail.png',
      }),
    )
    expect(mockLoggerError).not.toHaveBeenCalled()
  })
})
