import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { computeChecksum, simulateFrame } from '@conquestk/shared/lockstep'
import type { InputFrame } from '@conquestk/shared/types/lockstep'
import { hydrateSerializedGameState, toSerializedGameState } from '../utils/serializeGameState.js'

interface GoldenFixture {
  description: string
  baseline: import('../types/game.js').SerializedGameState
  frames: InputFrame[]
  expected: {
    finalSeq: number
    finalCrc32: number
  }
}

const fixturesDir = path.join(process.cwd(), 'src', 'test', 'fixtures', 'lockstep')

const loadFixture = (fileName: string): GoldenFixture => {
  const filePath = path.join(fixturesDir, fileName)
  const raw = readFileSync(filePath, 'utf8')
  return JSON.parse(raw) as GoldenFixture
}

describe('Lockstep golden frame fixtures', () => {
  const fixtureFiles = readdirSync(fixturesDir).filter((file) => file.endsWith('.json'))

  for (const fileName of fixtureFiles) {
    const testName = path.basename(fileName, '.json')
    it(`replays ${testName} and matches expected checksum`, () => {
      const fixture = loadFixture(fileName)
      const baseline = hydrateSerializedGameState(fixture.baseline)

      let working = baseline
      for (const frame of fixture.frames) {
        const { state, unsupported } = simulateFrame(working, frame)
        expect(unsupported).toHaveLength(0)
        working = state
      }

      const serialized = toSerializedGameState(working)
      const crc32 = computeChecksum(serialized)

      expect({ seq: fixture.frames.at(-1)?.seq, crc32 }).toEqual({
        seq: fixture.expected.finalSeq,
        crc32: fixture.expected.finalCrc32,
      })
    })
  }
})
