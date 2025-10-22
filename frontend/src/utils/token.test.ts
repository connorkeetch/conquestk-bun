import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'

import { parseJwt } from './token'

const encodeBase64Url = (value: string): string =>
  Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const createToken = (payload: Record<string, unknown>): string => {
  const header = { alg: 'none', typ: 'JWT' }
  return `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(JSON.stringify(payload))}.signature`
}

describe('parseJwt', () => {
  it('decodes multi-byte UTF-8 characters in the payload', () => {
    const payload = {
      displayName: '你好世界',
      locale: 'español',
      emoji: '🛡️',
    }

    const token = createToken(payload)
    expect(parseJwt(token)).toMatchObject(payload)
  })

  it('falls back to the polyfill when TextDecoder is unavailable', () => {
    const payload = {
      clan: 'Крепость',
      title: 'Señor del Café',
    }

    const token = createToken(payload)
    const originalTextDecoder = (globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder

    ;(globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder = undefined

    try {
      expect(parseJwt(token)).toMatchObject(payload)
    } finally {
      ;(globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder = originalTextDecoder
    }
  })
})
