import { promises as fs } from 'node:fs'
import path from 'node:path'
import { storeImageBuffer } from '../imageStorage.js'

const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/1cAAusB9sGbnGMAAAAASUVORK5CYII=',
  'base64',
)

const uploadsRoot = path.join(
  process.cwd(),
  path.basename(process.cwd()) === 'backend' ? 'uploads' : 'backend/uploads',
)

describe('storeImageBuffer filename handling', () => {
  afterEach(async () => {
    jest.restoreAllMocks()
    await fs.rm(path.join(uploadsRoot, 'maps'), { recursive: true, force: true })
  })

  it('sanitizes traversal-heavy filenames and keeps writes under uploads root', async () => {
    const writeFileSpy = jest.spyOn(fs, 'writeFile')

    const result = await storeImageBuffer(SAMPLE_PNG, {
      mimeType: 'image/png',
      preferredFilename: ' ..\\..//..\\malicious..//nested/../payload name?.png ',
    })

    expect(result.storageKey.startsWith('maps/')).toBe(true)
    expect(result.storageKey.includes('../')).toBe(false)
    expect(result.filename.startsWith('map-')).toBe(false)
    expect(result.filename.endsWith('payloadname.png')).toBe(true)

    expect(writeFileSpy).toHaveBeenCalled()
    for (const [destination] of writeFileSpy.mock.calls) {
      const relative = path.relative(uploadsRoot, destination as string)
      expect(relative.startsWith('..')).toBe(false)
      expect(path.isAbsolute(relative)).toBe(false)
    }
  })
})
