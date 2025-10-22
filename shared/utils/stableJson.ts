const textEncoder = new TextEncoder()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toSerializable = (value: unknown): unknown => {
  if (value === null) {
    return null
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      return null
    }
    if (Object.is(value, -0)) {
      return 0
    }
    return value
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item))
  }

  if (value instanceof Set) {
    return toSerializable(Array.from(value))
  }

  if (value instanceof Map) {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of value.entries()) {
      if (typeof k !== 'string') {
        continue
      }
      obj[k] = toSerializable(v)
    }
    return toSerializable(obj)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {}
    const keys = Object.keys(value).sort()
    for (const key of keys) {
      const normalised = toSerializable(value[key])
      if (normalised !== undefined) {
        result[key] = normalised
      }
    }
    return result
  }

  return undefined
}

/**
 * Serializes a value to a stable JSON string.
 *
 * @param {unknown} value - The value to serialize.
 * @returns {string} The stable JSON string.
 */
export const stableStringify = (value: unknown): string => {
  const normalised = toSerializable(value)
  return JSON.stringify(normalised)
}

/**
 * Serializes a value to a stable JSON string and encodes it as a Uint8Array.
 *
 * @param {unknown} value - The value to serialize.
 * @returns {Uint8Array} The encoded stable JSON string.
 */
export const stableStringifyToUint8 = (value: unknown): Uint8Array => {
  return textEncoder.encode(stableStringify(value))
}
