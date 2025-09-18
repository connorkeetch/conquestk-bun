jest.mock('../src/utils/logger', () => {
  const noop = jest.fn()
  return {
    logger: {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
    },
  }
})
