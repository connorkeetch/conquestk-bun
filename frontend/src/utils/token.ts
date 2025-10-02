export interface JwtPayload {
  exp?: number
  [key: string]: unknown
}

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4
  const padded = padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`

  const globalContext = globalThis as {
    atob?: typeof atob
    Buffer?: {
      from: (input: string, encoding: string) => { toString: (encoding: string) => string }
    }
  }

  if (typeof globalContext.atob === 'function') {
    return globalContext.atob(padded)
  }

  if (globalContext.Buffer) {
    return globalContext.Buffer.from(padded, 'base64').toString('binary')
  }

  throw new Error('No base64 decoder available in this environment')
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
