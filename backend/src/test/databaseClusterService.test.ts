import { withTimeout } from '../services/databaseClusterService.js'

describe('withTimeout', () => {
  it('does not emit unhandled rejections when the wrapped promise resolves before the timeout', async () => {
    const unhandledRejections: unknown[] = []
    const handler = (reason: unknown) => {
      unhandledRejections.push(reason)
    }

    process.on('unhandledRejection', handler)

    try {
      const fastPromise = Promise.resolve('ok')
      const { promise, cancel } = withTimeout(fastPromise, 50)

      let result: string | null = null
      try {
        result = await promise
        cancel()
      } finally {
        cancel()
      }

      expect(result).toBe('ok')

      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(unhandledRejections).toHaveLength(0)
    } finally {
      process.removeListener('unhandledRejection', handler)
    }
  })
})
