import fs from 'node:fs'
import process from 'node:process'
import { stableStringifyToUint8 } from '@conquestk/shared/utils/stableJson'
import { loadFrames, loadInitialSnapshot } from './replayHelpers.js'

const USAGE = 'Usage: npm run replay:export -- <matchId> [output.json]'

async function exportReplay(matchId: string, outputPath?: string): Promise<void> {
  const snapshot = await loadInitialSnapshot(matchId)
  if (!snapshot) {
    throw new Error(`No snapshots found for match ${matchId}`)
  }

  const frames = await loadFrames(matchId)
  const payload = {
    matchId,
    snapshot,
    frames,
  }

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2))
    // Write a companion checksum file so follow-up tooling can diff quickly.
    const checksumBytes = stableStringifyToUint8(payload)
    fs.writeFileSync(`${outputPath}.crc32`, Buffer.from(checksumBytes).toString('hex'))
  } else {
    process.stdout.write(JSON.stringify(payload, null, 2))
  }
}

const [, , matchId, outputPath] = process.argv

if (!matchId) {
  console.error(USAGE)
  process.exitCode = 1
} else {
  exportReplay(matchId, outputPath)
    .then(() => {
      if (outputPath) {
        console.log(`Exported replay frames for ${matchId} -> ${outputPath}`)
      }
    })
    .catch((error) => {
      console.error('Failed to export replay frames:', error)
      process.exitCode = 1
    })
}
