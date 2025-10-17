import { crc32 } from '../utils/crc32.js'
import { stableStringifyToUint8 } from '../utils/stableJson.js'

export const computeChecksum = (value: unknown): number => {
  const bytes = stableStringifyToUint8(value)
  return crc32(bytes)
}

export const encodeCanonicalState = (value: unknown): Uint8Array => {
  return stableStringifyToUint8(value)
}
