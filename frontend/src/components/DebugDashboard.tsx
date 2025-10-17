import { useEffect, useState } from 'react'
import { socketDebugger, type SocketDebugState } from '@/utils/socketDebugger'
import { logger } from '@/utils/logger'

export function DebugDashboard() {
  const [isVisible, setIsVisible] = useState(false)
  const [debugState, setDebugState] = useState<SocketDebugState>(socketDebugger.getState())
  const [activeTab, setActiveTab] = useState<'events' | 'rooms' | 'sequences' | 'pending'>(
    'events',
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Alt+Shift+D to toggle (very unique combo)
      if (e.ctrlKey && e.altKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setIsVisible((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!isVisible) return

    // Subscribe to debug state changes
    const unsubscribe = socketDebugger.subscribe(() => {
      setDebugState(socketDebugger.getState())
    })

    return unsubscribe
  }, [isVisible])

  const handleEnable = () => {
    socketDebugger.enable()
    localStorage.setItem('socket-debug', 'true')
    logger.info('Socket debugger enabled')
  }

  const handleDisable = () => {
    socketDebugger.disable()
    localStorage.removeItem('socket-debug')
    logger.info('Socket debugger disabled')
  }

  const handleClear = () => {
    socketDebugger.clearLogs()
  }

  if (!isVisible) return null

  const { events, deltaSequences, joinedRooms, pendingActions, connectionMetrics } = debugState
  const isEnabled = socketDebugger.isEnabled()

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-1 border border-border rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold">Socket Debug Dashboard</h2>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${connectionMetrics.connected ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className="text-sm text-muted">
                {connectionMetrics.connected ? 'Connected' : 'Disconnected'}
              </span>
              {connectionMetrics.connected && (
                <span className="text-xs text-muted">
                  ({connectionMetrics.totalEvents} events)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEnabled ? (
              <button
                type="button"
                onClick={handleDisable}
                className="px-3 py-1 text-sm bg-orange-600 hover:bg-orange-700 rounded"
              >
                Disable Debug
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEnable}
                className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 rounded"
              >
                Enable Debug
              </button>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1 text-sm bg-surface-2 hover:bg-surface-3 rounded"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsVisible(false)}
              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded"
            >
              Close
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b border-border bg-surface-2">
          <button
            type="button"
            onClick={() => setActiveTab('events')}
            className={`px-4 py-2 rounded ${activeTab === 'events' ? 'bg-violet text-white' : 'bg-surface-1 text-muted hover:bg-surface-3'}`}
          >
            Events ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rooms')}
            className={`px-4 py-2 rounded ${activeTab === 'rooms' ? 'bg-violet text-white' : 'bg-surface-1 text-muted hover:bg-surface-3'}`}
          >
            Rooms ({joinedRooms.size})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sequences')}
            className={`px-4 py-2 rounded ${activeTab === 'sequences' ? 'bg-violet text-white' : 'bg-surface-1 text-muted hover:bg-surface-3'}`}
          >
            Sequences ({deltaSequences.size})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded ${activeTab === 'pending' ? 'bg-violet text-white' : 'bg-surface-1 text-muted hover:bg-surface-3'}`}
          >
            Pending ({pendingActions.size})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {!isEnabled && (
            <div className="text-center py-8 text-muted">
              <p className="mb-4">Socket debugging is disabled.</p>
              <button
                type="button"
                onClick={handleEnable}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
              >
                Enable Debugging
              </button>
            </div>
          )}

          {isEnabled && activeTab === 'events' && (
            <div className="space-y-2">
              {events.length === 0 && (
                <div className="text-center py-8 text-muted">No events captured yet.</div>
              )}
              {[...events].reverse().map((event) => (
                <div
                  key={event.id}
                  className={`p-3 rounded border ${event.direction === 'outgoing' ? 'border-blue-500/30 bg-blue-500/5' : 'border-green-500/30 bg-green-500/5'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${event.direction === 'outgoing' ? 'bg-blue-600' : 'bg-green-600'}`}
                      >
                        {event.direction === 'outgoing' ? '↑ OUT' : '↓ IN'}
                      </span>
                      <span className="font-mono font-bold">{event.event}</span>
                      {event.roomId && (
                        <span className="text-xs text-muted">room: {event.roomId.slice(0, 8)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      {event.latency !== undefined && (
                        <span className="bg-yellow-600/20 px-2 py-0.5 rounded">
                          {event.latency}ms
                        </span>
                      )}
                      <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  {event.data && (
                    <pre className="text-xs bg-surface-3 p-2 rounded mt-2 overflow-x-auto">
                      {typeof event.data === 'string'
                        ? event.data
                        : JSON.stringify(event.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {isEnabled && activeTab === 'rooms' && (
            <div className="space-y-2">
              {joinedRooms.size === 0 && (
                <div className="text-center py-8 text-muted">Not in any rooms.</div>
              )}
              {Array.from(joinedRooms).map((roomId) => (
                <div key={roomId} className="p-3 rounded border border-border bg-surface-2">
                  <div className="font-mono">{roomId}</div>
                </div>
              ))}
            </div>
          )}

          {isEnabled && activeTab === 'sequences' && (
            <div className="space-y-2">
              {deltaSequences.size === 0 && (
                <div className="text-center py-8 text-muted">No delta sequences tracked.</div>
              )}
              {Array.from(deltaSequences.values()).map((seq) => (
                <div key={seq.roomId} className="p-3 rounded border border-border bg-surface-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono">{seq.roomId}</span>
                    <span className="text-sm text-muted">Last: v{seq.lastSequence}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted">Received:</span> {seq.receivedCount}
                    </div>
                    <div>
                      <span className="text-muted">Duplicates:</span> {seq.duplicates}
                    </div>
                    <div>
                      <span className="text-muted">Gaps:</span> {seq.gaps.length}
                    </div>
                  </div>
                  {seq.gaps.length > 0 && (
                    <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs">
                      <strong>Gaps detected:</strong>
                      {seq.gaps.map((gap, i) => (
                        <div key={i}>
                          {gap.from} - {gap.to} (missing {gap.to - gap.from + 1} deltas)
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {isEnabled && activeTab === 'pending' && (
            <div className="space-y-2">
              {pendingActions.size === 0 && (
                <div className="text-center py-8 text-muted">No pending actions.</div>
              )}
              {Array.from(pendingActions.entries()).map(([key, value]) => (
                <div key={key} className="p-3 rounded border border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm">{value.action}</span>
                    <span className="text-xs text-muted">
                      {Math.round((Date.now() - value.timestamp) / 1000)}s ago
                    </span>
                  </div>
                  <div className="text-xs font-mono text-muted break-all">{key}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-surface-2 text-xs text-muted">
          <div className="flex items-center justify-between">
            <span>Press Ctrl+Alt+Shift+D to toggle this dashboard</span>
            <span>
              {connectionMetrics.lastConnectAt && (
                <>Connected at: {new Date(connectionMetrics.lastConnectAt).toLocaleTimeString()}</>
              )}
              {connectionMetrics.reconnectCount > 1 && (
                <> (Reconnects: {connectionMetrics.reconnectCount - 1})</>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
