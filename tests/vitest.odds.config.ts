import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    watch: false,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    reporters: 'default',
    testTimeout: 120000,
  },
})

