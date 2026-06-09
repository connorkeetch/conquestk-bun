import { describe, expect, it, mock } from 'bun:test'

// storeImageBuffer now persists via assetStorage.uploadAsset (R2) rather than
// writing to a local uploads directory. Mock the uploader so the test stays
// focused on filename sanitization -> safe storage key (the security-relevant
// behaviour) without requiring R2 configuration.
mock.module('../assetStorage.js', () => ({
  uploadAsset: mock(async (options: { key: string }) => ({
    key: options.key,
    url: `/uploads/${options.key}`,
    storage: 'local' as const,
  })),
  getPublicAssetUrl: (key: string) => `/uploads/${key}`,
  isRemoteAssetStorageEnabled: () => false,
}))

const { storeImageBuffer } = await import('../imageStorage.js')

const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/1cAAusB9sGbnGMAAAAASUVORK5CYII=',
  'base64',
)

describe('storeImageBuffer filename handling', () => {
  it('sanitizes traversal-heavy filenames into a safe storage key', async () => {
    const result = await storeImageBuffer(SAMPLE_PNG, {
      mimeType: 'image/png',
      preferredFilename: ' ..\\..//..\\malicious..//nested/../payload name?.png ',
    })

    expect(result.storageKey.startsWith('maps/')).toBe(true)
    expect(result.storageKey.includes('../')).toBe(false)
    expect(result.storageKey.includes('..\\')).toBe(false)
    expect(result.filename.startsWith('map-')).toBe(false)
    expect(result.filename.endsWith('payloadname.png')).toBe(true)
  })
})
