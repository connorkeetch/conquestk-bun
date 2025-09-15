import type React from 'react'
import { useEffect, useState } from 'react'

interface TroopMovementProps {
  from: { x: number; y: number }
  to: { x: number; y: number }
  count: number
  color: string
  duration?: number
  onComplete?: () => void
}

export const TroopMovement: React.FC<TroopMovementProps> = ({
  from,
  to,
  count,
  color,
  duration = 1000,
  onComplete,
}) => {
  const [position, setPosition] = useState(from)
  const [opacity, setOpacity] = useState(1)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    // Start animation after mount
    const startTime = Date.now()

    const animate = () => {
      const now = Date.now()
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Easing function (ease-in-out)
      const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress

      // Interpolate position
      const newX = from.x + (to.x - from.x) * eased
      const newY = from.y + (to.y - from.y) * eased
      setPosition({ x: newX, y: newY })

      // Scale effect (grow in middle, shrink at end)
      if (progress < 0.5) {
        setScale(1 + progress * 0.4)
      } else {
        setScale(1.4 - (progress - 0.5) * 0.8)
      }

      // Fade at the end
      if (progress > 0.8) {
        setOpacity(1 - (progress - 0.8) * 5)
      }

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        onComplete?.()
      }
    }

    const animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [from, to, duration, onComplete])

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: position.x,
        top: position.y,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        transition: 'none',
      }}
    >
      <div
        className="flex items-center justify-center rounded-full shadow-lg"
        style={{
          backgroundColor: color,
          width: '40px',
          height: '40px',
          boxShadow: `0 0 20px ${color}50`,
        }}
      >
        <span className="text-white font-bold text-lg">{count}</span>
      </div>
    </div>
  )
}

interface BattleExplosionProps {
  x: number
  y: number
  winner: 'attacker' | 'defender'
  onComplete?: () => void
}

export const BattleExplosion: React.FC<BattleExplosionProps> = ({ x, y, winner, onComplete }) => {
  const [particles, setParticles] = useState<
    Array<{
      id: number
      x: number
      y: number
      vx: number
      vy: number
      size: number
      color: string
    }>
  >([])

  useEffect(() => {
    // Create explosion particles
    const colors =
      winner === 'attacker'
        ? ['#EF4444', '#F87171', '#FCA5A5'] // Red shades
        : ['#3B82F6', '#60A5FA', '#93C5FD'] // Blue shades

    const newParticles = Array.from({ length: 20 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 20 + (Math.random() - 0.5) * 0.3
      const speed = 2 + Math.random() * 3
      return {
        id: i,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
      }
    })

    setParticles(newParticles)

    // Animate particles
    let frame: number
    const startTime = Date.now()
    const duration = 1000

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      setParticles((prev) =>
        prev.map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.3, // Gravity
          size: p.size * (1 - progress * 0.8),
        })),
      )

      if (progress < 1) {
        frame = requestAnimationFrame(animate)
      } else {
        onComplete?.()
      }
    }

    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [winner, onComplete])

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size}px ${p.color}`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  )
}

interface DiceRollAnimationProps {
  attacker: number
  defender: number
  x: number
  y: number
  onComplete?: () => void
}

export const DiceRollAnimation: React.FC<DiceRollAnimationProps> = ({
  attacker,
  defender,
  x,
  y,
  onComplete,
}) => {
  const [rolling, setRolling] = useState(true)
  const [displayAttacker, setDisplayAttacker] = useState('?')
  const [displayDefender, setDisplayDefender] = useState('?')

  useEffect(() => {
    // Simulate dice rolling
    let rollCount = 0
    const maxRolls = 15

    const rollInterval = setInterval(() => {
      if (rollCount < maxRolls) {
        setDisplayAttacker(String(Math.floor(Math.random() * 6) + 1))
        setDisplayDefender(String(Math.floor(Math.random() * 6) + 1))
        rollCount++
      } else {
        // Show final values
        setDisplayAttacker(String(attacker))
        setDisplayDefender(String(defender))
        setRolling(false)
        clearInterval(rollInterval)

        // Complete after a delay
        setTimeout(() => {
          onComplete?.()
        }, 1000)
      }
    }, 100)

    return () => clearInterval(rollInterval)
  }, [attacker, defender, onComplete])

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="flex gap-4 bg-black/80 rounded-lg p-3">
        <div className={`flex flex-col items-center ${rolling ? 'animate-bounce' : ''}`}>
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg"
            style={{ backgroundColor: '#EF4444' }}
          >
            {displayAttacker}
          </div>
          <span className="text-xs mt-1" style={{ color: '#F87171' }}>
            ATK
          </span>
        </div>

        <div className="flex items-center text-white text-lg font-bold">VS</div>

        <div className={`flex flex-col items-center ${rolling ? 'animate-bounce' : ''}`}>
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {displayDefender}
          </div>
          <span className="text-xs mt-1" style={{ color: 'var(--color-primary-soft)' }}>
            DEF
          </span>
        </div>
      </div>

      {!rolling && (
        <div
          className="text-center mt-2 font-bold"
          style={{ color: attacker > defender ? '#F87171' : 'var(--color-primary-soft)' }}
        >
          {attacker > defender ? 'Attacker Wins!' : 'Defender Wins!'}
        </div>
      )}
    </div>
  )
}

// Victory celebration particles
export const VictoryParticles: React.FC<{ territoryId: string }> = ({ territoryId }) => {
  const [particles, setParticles] = useState<
    Array<{
      id: number
      x: number
      y: number
      rotation: number
      color: string
    }>
  >([])

  useEffect(() => {
    const colors = ['var(--color-secondary)', '#F97316', '#EC4899', '#06B6D4', '#8B5CF6']

    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100 - 50,
      y: -20 - Math.random() * 50,
      rotation: Math.random() * 360,
      color: colors[Math.floor(Math.random() * colors.length)],
    }))

    setParticles(newParticles)

    // Animate falling
    const interval = setInterval(() => {
      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            y: p.y + 2,
            rotation: p.rotation + 5,
          }))
          .filter((p) => p.y < 150),
      )
    }, 50)

    // Cleanup after animation
    setTimeout(() => {
      clearInterval(interval)
      setParticles([])
    }, 3000)

    return () => clearInterval(interval)
  }, [territoryId])

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `50%`,
            top: '30%',
            transform: `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg)`,
          }}
        >
          <div
            className="w-3 h-3"
            style={{
              backgroundColor: p.color,
              clipPath:
                'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
            }}
          />
        </div>
      ))}
    </div>
  )
}
