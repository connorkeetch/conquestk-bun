const isDevelopment = import.meta.env.DEV

type LogLevel = 'error' | 'warn' | 'info' | 'debug'
type LogDetail = unknown

type GlobalWithReportError = typeof globalThis & {
  reportError?: (error: unknown) => void
}

const logToConsole = (level: LogLevel, message: string, details: LogDetail[]) => {
  if (!isDevelopment) {
    return
  }

  const globalConsole = globalThis.console

  if (!globalConsole) {
    return
  }

  const consoleMethod =
    level === 'debug'
      ? globalConsole.debug?.bind(globalConsole)
      : (globalConsole[level]?.bind(globalConsole) ?? globalConsole.log?.bind(globalConsole))

  if (!consoleMethod) {
    return
  }

  consoleMethod(`[${level.toUpperCase()}] ${message}`, ...details)
}

const maybeReportError = (details: LogDetail[]) => {
  const errorDetail = details.find((detail): detail is Error => detail instanceof Error)

  if (!errorDetail) {
    return
  }

  const globalScope = globalThis as GlobalWithReportError

  if (typeof globalScope.reportError === 'function') {
    globalScope.reportError(errorDetail)
    return
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('app:error', { detail: errorDetail }))
    } catch {
      // Ignore event dispatch failures to avoid breaking runtime error handling
    }
  }
}

const log = (level: LogLevel, message: string, details: LogDetail[]) => {
  logToConsole(level, message, details)

  if (level === 'error') {
    maybeReportError(details)
  }
}

export const logger = {
  error(message: string, ...details: LogDetail[]) {
    log('error', message, details)
  },
  warn(message: string, ...details: LogDetail[]) {
    log('warn', message, details)
  },
  info(message: string, ...details: LogDetail[]) {
    log('info', message, details)
  },
  debug(message: string, ...details: LogDetail[]) {
    if (!isDevelopment) {
      return
    }

    log('debug', message, details)
  },
}

export default logger
