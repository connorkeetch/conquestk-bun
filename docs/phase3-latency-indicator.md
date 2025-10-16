# Phase 3: Connection Latency Indicator Guide

## Overview
A visual indicator showing real-time connection quality and latency, helping users understand when network issues may affect gameplay.

## UI Design

### Visual States
- **Green** (<100ms): Excellent connection
- **Yellow** (100-300ms): Good connection
- **Orange** (300-500ms): Fair connection
- **Red** (>500ms): Poor connection
- **Gray**: Disconnected/Reconnecting

## Implementation

### 1. Create Connection Badge Component

**File:** `frontend/src/components/game/ConnectionBadge.tsx`

```tsx
import { useEffect, useState } from 'react'
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { socketService } from '@/services/socketService'
import { useAppSelector } from '@/store'

interface ConnectionStats {
  latency: number
  lastPong: number
  isHealthy: boolean
  reconnectCount: number
  actionSuccessRate: number
}

export function ConnectionBadge() {
  const [stats, setStats] = useState<ConnectionStats>({
    latency: 0,
    lastPong: Date.now(),
    isHealthy: true,
    reconnectCount: 0,
    actionSuccessRate: 100,
  })
  const [showDetails, setShowDetails] = useState(false)
  const connectionStatus = useAppSelector(state => state.game.connectionStatus)

  useEffect(() => {
    // Poll connection health every 2 seconds
    const interval = setInterval(() => {
      const health = socketService.getConnectionHealth()
      const metrics = socketService.getReliabilityMetrics?.() || {
        reconnectCount: 0,
        actionSuccessRate: 100,
      }

      setStats({
        latency: health.latency,
        lastPong: health.lastPong,
        isHealthy: health.isHealthy,
        reconnectCount: metrics.reconnectCount,
        actionSuccessRate: metrics.actionSuccessRate,
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const getLatencyColor = (latency: number) => {
    if (!stats.isHealthy || connectionStatus === 'disconnected') return 'gray'
    if (latency < 100) return 'green'
    if (latency < 300) return 'yellow'
    if (latency < 500) return 'orange'
    return 'red'
  }

  const getLatencyLabel = (latency: number) => {
    if (!stats.isHealthy || connectionStatus === 'disconnected') return 'Offline'
    if (latency < 100) return 'Excellent'
    if (latency < 300) return 'Good'
    if (latency < 500) return 'Fair'
    return 'Poor'
  }

  const color = getLatencyColor(stats.latency)
  const label = getLatencyLabel(stats.latency)
  const isDisconnected = connectionStatus === 'disconnected' || !stats.isHealthy

  return (
    <div className="relative">
      {/* Main Badge */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all",
          "hover:scale-105 active:scale-95",
          color === 'green' && "bg-green-500/20 text-green-400 border border-green-500/30",
          color === 'yellow' && "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
          color === 'orange' && "bg-orange-500/20 text-orange-400 border border-orange-500/30",
          color === 'red' && "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse",
          color === 'gray' && "bg-gray-500/20 text-gray-400 border border-gray-500/30",
        )}
      >
        {isDisconnected ? (
          <WifiOff className="w-4 h-4" />
        ) : stats.latency > 300 ? (
          <AlertTriangle className="w-4 h-4" />
        ) : (
          <Wifi className="w-4 h-4" />
        )}

        <span className="text-sm font-medium">
          {isDisconnected ? label : `${stats.latency}ms`}
        </span>
      </button>

      {/* Details Popup */}
      {showDetails && (
        <div className="absolute top-full mt-2 right-0 z-50 min-w-[280px] bg-surface-2 border border-border rounded-lg shadow-lg p-4">
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted mb-1">Connection Quality</div>
              <div className={cn(
                "text-lg font-bold",
                color === 'green' && "text-green-400",
                color === 'yellow' && "text-yellow-400",
                color === 'orange' && "text-orange-400",
                color === 'red' && "text-red-400",
                color === 'gray' && "text-gray-400",
              )}>
                {label}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted">Latency</div>
                <div className="text-sm font-medium">{stats.latency}ms</div>
              </div>

              <div>
                <div className="text-xs text-muted">Status</div>
                <div className="text-sm font-medium capitalize">{connectionStatus}</div>
              </div>

              <div>
                <div className="text-xs text-muted">Reconnects</div>
                <div className="text-sm font-medium">{stats.reconnectCount}</div>
              </div>

              <div>
                <div className="text-xs text-muted">Success Rate</div>
                <div className="text-sm font-medium">{stats.actionSuccessRate.toFixed(1)}%</div>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <div className="text-xs text-muted">
                Last ping: {Math.floor((Date.now() - stats.lastPong) / 1000)}s ago
              </div>
            </div>

            {stats.latency > 300 && (
              <div className="pt-2 border-t border-border text-xs text-orange-400">
                ⚠️ High latency detected. Actions may feel slower than usual.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

### 2. Add Reliability Metrics to Socket Service

**File:** `frontend/src/services/socketService.ts`

Add metrics tracking:

```typescript
private reliabilityMetrics = {
  actionsAttempted: 0,
  actionsSucceeded: 0,
  actionsFailed: 0,
  reconnectCount: 0,
  deltaGapsDetected: 0,
  lastResetAt: Date.now(),
}

/**
 * Get reliability metrics for monitoring
 */
getReliabilityMetrics(): {
  reconnectCount: number
  actionSuccessRate: number
  totalActions: number
  deltaGaps: number
  uptimeMs: number
} {
  const total = this.reliabilityMetrics.actionsAttempted
  const successRate = total > 0
    ? (this.reliabilityMetrics.actionsSucceeded / total) * 100
    : 100

  return {
    reconnectCount: this.reliabilityMetrics.reconnectCount,
    actionSuccessRate: successRate,
    totalActions: total,
    deltaGaps: this.reliabilityMetrics.deltaGapsDetected,
    uptimeMs: Date.now() - this.reliabilityMetrics.lastResetAt,
  }
}

/**
 * Reset metrics (called on game end or new game)
 */
resetReliabilityMetrics(): void {
  this.reliabilityMetrics = {
    actionsAttempted: 0,
    actionsSucceeded: 0,
    actionsFailed: 0,
    reconnectCount: 0,
    deltaGapsDetected: 0,
    lastResetAt: Date.now(),
  }
}
```

Update action tracking:

```typescript
private async sendActionWithAck(...): Promise<...> {
  this.reliabilityMetrics.actionsAttempted++

  // ... existing logic ...

  const result = await this._sendActionInternal(...)

  if (result.ok) {
    this.reliabilityMetrics.actionsSucceeded++
  } else {
    this.reliabilityMetrics.actionsFailed++
  }

  return result
}

// In connect handler:
this.socket.on('connect', () => {
  // ... existing logic ...

  // Track reconnects (skip first connect)
  if (this.reliabilityMetrics.lastResetAt < Date.now() - 5000) {
    this.reliabilityMetrics.reconnectCount++
  }
})

// In checkDeltaSequence:
private async checkDeltaSequence(...): Promise<boolean> {
  // ... existing logic ...

  // Track gaps
  if (currentSeq > lastSeq + 1) {
    this.reliabilityMetrics.deltaGapsDetected++
  }

  // ... rest of logic ...
}
```

### 3. Integrate Badge into Game Room

**File:** `frontend/src/pages/GameRoom.tsx`

Add badge to the top-right corner:

```tsx
import { ConnectionBadge } from '@/components/game/ConnectionBadge'

export function GameRoom() {
  return (
    <div className="relative h-screen">
      {/* Existing game UI */}

      {/* Connection Badge - Top Right */}
      <div className="absolute top-4 right-4 z-40">
        <ConnectionBadge />
      </div>

      {/* Rest of game UI */}
    </div>
  )
}
```

### 4. Add Pulse Animation for Poor Connection

**File:** `frontend/src/app.css`

```css
@keyframes connection-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

.connection-poor {
  animation: connection-pulse 2s ease-in-out infinite;
}
```

## Advanced Features

### 1. Connection History Graph

Show latency over time:

```tsx
import { Line } from 'react-chartjs-2'

const [latencyHistory, setLatencyHistory] = useState<number[]>([])

useEffect(() => {
  const interval = setInterval(() => {
    const health = socketService.getConnectionHealth()
    setLatencyHistory(prev => [...prev.slice(-20), health.latency])
  }, 2000)
  return () => clearInterval(interval)
}, [])

// In details popup:
<Line
  data={{
    labels: latencyHistory.map((_, i) => `${i * 2}s`),
    datasets: [{
      label: 'Latency (ms)',
      data: latencyHistory,
      borderColor: 'rgb(59, 130, 246)',
      tension: 0.4,
    }]
  }}
  options={{
    scales: {
      y: { beginAtZero: true }
    }
  }}
/>
```

### 2. Network Speed Test

Measure actual bandwidth:

```typescript
async function measureBandwidth(): Promise<{ downloadMbps: number; uploadMbps: number }> {
  // Download test: fetch small asset
  const start = performance.now()
  await fetch('/api/health') // Replace with actual endpoint
  const downloadTime = performance.now() - start

  // Upload test: send dummy data
  const uploadStart = performance.now()
  await fetch('/api/ping', { method: 'POST', body: 'x'.repeat(1024) })
  const uploadTime = performance.now() - uploadStart

  return {
    downloadMbps: (1024 * 8) / (downloadTime / 1000) / 1000000,
    uploadMbps: (1024 * 8) / (uploadTime / 1000) / 1000000,
  }
}
```

### 3. Auto-Reconnect Notification

Show toast when connection recovers:

```tsx
// In socket event listeners:
this.socket.on('connect', () => {
  // ... existing logic ...

  if (this.reliabilityMetrics.reconnectCount > 0) {
    toast.success(
      `Connection restored (${this.connectionLatency}ms latency)`,
      { duration: 3000 }
    )
  }
})
```

## Testing Latency Indicator

### Test Case 1: Simulate High Latency
```bash
# Chrome DevTools -> Network -> Throttling -> Slow 3G
# Expected: Badge turns orange/red, shows warning
```

### Test Case 2: Disconnect
```bash
# Turn off WiFi
# Expected: Badge shows "Offline" in gray
```

### Test Case 3: Reconnect
```bash
# Turn WiFi back on
# Expected: Badge shows green with success toast
```

## Key Benefits

1. **User Awareness**: Players know when lag affects gameplay
2. **Proactive Troubleshooting**: "Connection poor" prompts users to check WiFi
3. **Trust**: Transparency about connection quality builds confidence
4. **Debugging**: Metrics help diagnose real-time issues

## Performance Notes

- Polling every 2s is lightweight (negligible CPU)
- No impact on game performance
- Badge only renders when visible
- Metrics stored in memory (no persistence overhead)
