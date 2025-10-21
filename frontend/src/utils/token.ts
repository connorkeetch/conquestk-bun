export interface JwtPayload {
  exp?: number
  [key: string]: unknown
}

const decodeUtf8WithPolyfill = (bytes: Uint8Array): string => {
  let encoded = ''

  for (const byte of bytes) {
    encoded += `%${byte.toString(16).padStart(2, '0')}`
  }

  try {
    return decodeURIComponent(encoded)
  } catch (error) {
    throw new Error(`Failed to decode UTF-8 sequence: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4
  const padded = padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`

  const globalContext = globalThis as {
    atob?: typeof atob
    Buffer?: {
      from: (input: string, encoding: string) => Uint8Array
    }
    TextDecoder?: typeof TextDecoder
  }

  const bytes = (() => {
    if (typeof globalContext.atob === 'function') {
      const binary = globalContext.atob(padded)
      const array = new Uint8Array(binary.length)

      for (let index = 0; index < binary.length; index += 1) {
        array[index] = binary.charCodeAt(index)
      }

      return array
    }

    if (globalContext.Buffer) {
      const buffer = globalContext.Buffer.from(padded, 'base64')
      return buffer instanceof Uint8Array ? new Uint8Array(buffer) : Uint8Array.from(buffer as unknown as number[])
    }

    throw new Error('No base64 decoder available in this environment')
  })()

  if (typeof globalContext.TextDecoder === 'function') {
    try {
      return new globalContext.TextDecoder('utf-8').decode(bytes)
    } catch (error) {
      return decodeUtf8WithPolyfill(bytes)
    }
  }

  return decodeUtf8WithPolyfill(bytes)
}

export const parseJwt = (token: string): JwtPayload | null => {
  try {
    const [, payload] = token.split('.')
    if (!payload) {
      return null
    }

    const decoded = decodeBase64Url(payload)
    return JSON.parse(decoded) as JwtPayload
  } catch (_error) {
    return null
  }
}

export const isTokenExpired = (token: string, bufferSeconds = 0): boolean => {
  const payload = parseJwt(token)

  if (!payload?.exp) {
    return false
  }

  const bufferMs = bufferSeconds * 1000
  const expiryTimeMs = payload.exp * 1000

  return Date.now() >= expiryTimeMs - bufferMs
}
