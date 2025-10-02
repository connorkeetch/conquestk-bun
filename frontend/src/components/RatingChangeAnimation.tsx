import type React from 'react'
import { useEffect, useState } from 'react'

interface RatingChangeAnimationProps {
  change: number
  onComplete?: () => void
  className?: string
}

const RatingChangeAnimation: React.FC<RatingChangeAnimationProps> = ({
  change,
  onComplete,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(true)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    setIsVisible(true)
    setIsAnimating(false)
    void change

    // Start animation after a brief delay
    const animateTimer = setTimeout(() => {
      setIsAnimating(true)
    }, 100)

    // Hide and call onComplete after animation
    const hideTimer = setTimeout(() => {
      setIsVisible(false)
      onComplete?.()
    }, 2500)

    return () => {
      clearTimeout(animateTimer)
      clearTimeout(hideTimer)
    }
  }, [change, onComplete])

  if (!isVisible) return null

  const isPositive = change > 0
  const sign = isPositive ? '+' : ''
  const colorClass = isPositive ? 'text-green-400' : 'text-red-400'
  const glowClass = isPositive
    ? 'drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]'
    : 'drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]'

  return (
    <div
      className={`
        fixed top-1/2 left-1/2 z-50 
        transform -translate-x-1/2 
        ${isAnimating ? '-translate-y-20 opacity-0' : '-translate-y-1/2 opacity-100'}
        transition-all duration-2000 ease-out
        ${className}
      `}
    >
      <div className={`text-6xl font-bold ${colorClass} ${glowClass}`}>
        {sign}
        {change} CP
      </div>
      <div className="text-center mt-2 text-lg text-muted">
        Command Points {isPositive ? 'Gained' : 'Lost'}
      </div>
    </div>
  )
}

export default RatingChangeAnimation
