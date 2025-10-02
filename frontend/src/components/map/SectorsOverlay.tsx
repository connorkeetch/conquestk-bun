import { useMemo } from 'react'

type Territory = {
  id: string
  x: number
  y: number
  continent?: string | null
}

interface SectorsOverlayProps {
  mapWidth: number
  mapHeight: number
  territories: Territory[]
  showLegend?: boolean
}

export function SectorsOverlay({
  mapWidth,
  mapHeight,
  territories,
  showLegend = true,
}: SectorsOverlayProps) {
  const { uniqueContinents, colorMap } = useMemo(() => {
    const unique = Array.from(new Set(territories.map((t) => t.continent || 'unknown')))
    const palette = [
      '#22c55e',
      '#06b6d4',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#eab308',
      '#14b8a6',
      '#f97316',
    ]
    const cMap = new Map<string, string>()
    unique.forEach((c, i) => {
      cMap.set(c, palette[i % palette.length])
    })
    return { uniqueContinents: unique, colorMap: cMap }
  }, [territories])

  return (
    <>
      {territories.map((t) => {
        const color = colorMap.get(t.continent || 'unknown') || '#94a3b8'
        return (
          <div
            key={`cont-${t.id}`}
            className="absolute z-10 pointer-events-none"
            style={{
              left: `${(t.x / mapWidth) * 100}%`,
              top: `${(t.y / mapHeight) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
            title={`Sector: ${t.continent ?? 'unknown'}`}
          >
            <span
              className="inline-block w-3 h-3 rounded-full border border-white/60 shadow"
              style={{ backgroundColor: color }}
            />
          </div>
        )
      })}

      {showLegend && (
        <div className="absolute bottom-2 right-2 z-30 bg-surface-2/80 backdrop-blur border border-border rounded px-2 py-1 text-xs">
          <div className="flex items-center gap-3 flex-wrap max-w-[320px]">
            {uniqueContinents.map((c) => (
              <span key={`legend-${c}`} className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full border border-white/60"
                  style={{ backgroundColor: colorMap.get(c) || '#94a3b8' }}
                />
                <span className="text-white/90 capitalize">{c}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export default SectorsOverlay
