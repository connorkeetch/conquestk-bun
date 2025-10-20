import type { Socket } from 'socket.io-client'
import { logger } from './logger'

export interface SocketEventLog {
  id: string
  timestamp: number
  event: string
  direction: 'incoming' | 'outgoing'
  data?: unknown
  roomId?: string
  latency?: number
}
export interface SocketDebugState {
  events: SocketEventLog[]
  joinedRooms: Set<string>
  pendingActions: Map<string, { action: string; timestamp: number }>
  connectionMetrics: {
    connected: boolean
    lastConnectAt?: number
    lastDisconnectAt?: number
    reconnectCount: number
    totalEvents: number
  }
}

class SocketDebugger {
  private state: SocketDebugState = {
    events: [],
    joinedRooms: new Set(),
    pendingActions: new Map(),
    connectionMetrics: {
      connected: false,
      reconnectCount: 0,
      totalEvents: 0,
    },
  }

  private maxEvents = 200 // Keep last 200 events
  private enabled = false
  private pendingEmitTimestamps: Map<string, number> = new Map()
  private listeners: Array<() => void> = []

  enable() {
    this.enabled = true
    logger.info('[SocketDebugger] Enabled')
  }

  disable() {
    this.enabled = false
    logger.info('[SocketDebugger] Disabled')
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Wrap a socket instance to intercept all events
   */
  instrumentSocket(socket: Socket): void {
    if (!this.enabled) return

    // Intercept connect/disconnect
    const originalOn = socket.on.bind(socket)
    const originalEmit = socket.emit.bind(socket)

    // Track connection state
    socket.on('connect', () => {
      this.state.connectionMetrics.connected = true
      this.state.connectionMetrics.lastConnectAt = Date.now()
      this.state.connectionMetrics.reconnectCount++
      this.logEvent({
        id: `connect-${Date.now()}`,
        timestamp: Date.now(),
        event: 'connect',
        direction: 'incoming',
      })
      this.notifyListeners()
    })

    socket.on('disconnect', () => {
      this.state.connectionMetrics.connected = false
      this.state.connectionMetrics.lastDisconnectAt = Date.now()
      this.logEvent({
        id: `disconnect-${Date.now()}`,
        timestamp: Date.now(),
        event: 'disconnect',
        direction: 'incoming',
      })
      this.notifyListeners()
    })

    // Intercept all incoming events
    const interceptOn = (event: string, handler: (...args: unknown[]) => void) => {
      return originalOn(event, (...args: unknown[]) => {
        const eventId = `${event}-${Date.now()}-${Math.random()}`

        // Check for latency on ack callbacks
        let latency: number | undefined
        if (event === 'game-action') {
          const idempotencyKey = (args[0] as { idempotencyKey?: string })?.idempotencyKey
          if (idempotencyKey) {
            const emitTime = this.pendingEmitTimestamps.get(idempotencyKey)
            if (emitTime) {
              latency = Date.now() - emitTime
              this.pendingEmitTimestamps.delete(idempotencyKey)
            }
          }
        }

        const eventLog: SocketEventLog = {
          id: eventId,
          timestamp: Date.now(),
          event,
          direction: 'incoming',
          data: this.sanitizeData(args[0]),
          latency,
        }

        // Extract roomId if present
        if (args[0] && typeof args[0] === 'object') {
          const data = args[0] as { roomId?: string }
          if (data.roomId) {
            eventLog.roomId = data.roomId
          }
        }

        // Track room joins
        if (event === 'join-room') {
          const roomId = (args[0] as { roomId?: string })?.roomId
          if (roomId) {
            this.state.joinedRooms.add(roomId)
          }
        }

        this.logEvent(eventLog)
        this.notifyListeners()

        // Call original handler
        return handler(...args)
      })
    }

    // Intercept all outgoing events
    const interceptEmit = (event: string, ...args: unknown[]) => {
      const eventId = `${event}-${Date.now()}-${Math.random()}`

      // Track emit timestamp for latency calculation
      if (event === 'game-action' && args[0]) {
        const data = args[0] as { idempotencyKey?: string }
        if (data.idempotencyKey) {
          this.pendingEmitTimestamps.set(data.idempotencyKey, Date.now())
          this.state.pendingActions.set(data.idempotencyKey, {
            action: event,
            timestamp: Date.now(),
          })
        }
      }

      const eventLog: SocketEventLog = {
        id: eventId,
        timestamp: Date.now(),
        event,
        direction: 'outgoing',
        data: this.sanitizeData(args[0]),
      }

      // Extract roomId if present
      if (args[0] && typeof args[0] === 'object') {
        const data = args[0] as { roomId?: string }
        if (data.roomId) {
          eventLog.roomId = data.roomId
        }
      }

      this.logEvent(eventLog)
      this.notifyListeners()

      // Call original emit
      return originalEmit(event, ...args)
    }

    // Monkey-patch socket methods
    socket.on = interceptOn as never
    socket.emit = interceptEmit as never

    logger.info('[SocketDebugger] Socket instrumented')
  }

  private logEvent(event: SocketEventLog) {
    if (!this.enabled) return

    this.state.events.push(event)
    this.state.connectionMetrics.totalEvents++

    // Keep only last N events
    if (this.state.events.length > this.maxEvents) {
      this.state.events = this.state.events.slice(-this.maxEvents)
    }
  }

  private sanitizeData(data: unknown): unknown {
    if (!data) return data

    try {
      // Truncate large payloads for display
      const str = JSON.stringify(data)
      if (str.length > 1000) {
        return `[${str.length} bytes] ${str.slice(0, 100)}...`
      }
      return data
    } catch {
      return '[Non-serializable data]'
    }
  }

  subscribe(callback: () => void): () => void {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback)
    }
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        logger.warn('[SocketDebugger] Listener error', { error })
      }
    }
  }

  getState(): SocketDebugState {
    return this.state
  }

  clearLogs() {
    this.state.events = []
    this.state.connectionMetrics.totalEvents = 0
    logger.info('[SocketDebugger] Logs cleared')
    this.notifyListeners()
  }

  clearPendingAction(idempotencyKey: string) {
    this.state.pendingActions.delete(idempotencyKey)
    this.pendingEmitTimestamps.delete(idempotencyKey)
    this.notifyListeners()
  }
}

export const socketDebugger = new SocketDebugger()

// Enable via localStorage for convenience
if (typeof window !== 'undefined') {
  const debugEnabled = localStorage.getItem('socket-debug') === 'true'
  if (debugEnabled) {
    socketDebugger.enable()
  }
  // Expose to window for easy console access
  ;(window as never as { __socketDebugger: SocketDebugger }).__socketDebugger = socketDebugger
}
