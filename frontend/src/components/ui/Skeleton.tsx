import type React from 'react'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'card'
  animation?: 'pulse' | 'wave' | 'none'
  width?: string | number
  height?: string | number
  rounded?: boolean
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  animation = 'pulse',
  width,
  height,
  rounded = false,
}) => {
  const baseClasses = 'bg-gray-700/50'
  
  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer bg-gradient-to-r from-gray-700/50 via-gray-600/50 to-gray-700/50 bg-[length:200%_100%]',
    none: '',
  }

  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: rounded ? 'rounded-lg' : 'rounded',
    card: 'rounded-lg',
  }

  const sizeStyles: React.CSSProperties = {
    width: width || (variant === 'circular' ? 40 : '100%'),
    height: height || (variant === 'circular' ? 40 : variant === 'card' ? 200 : 16),
  }

  return (
    <div
      className={`${baseClasses} ${animationClasses[animation]} ${variantClasses[variant]} ${className}`}
      style={sizeStyles}
    />
  )
}

// Skeleton group for loading multiple items
interface SkeletonGroupProps {
  count: number
  className?: string
  children: (index: number) => React.ReactNode
}

export const SkeletonGroup: React.FC<SkeletonGroupProps> = ({ count, className = '', children }) => {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>{children(i)}</div>
      ))}
    </div>
  )
}

// Preset skeleton components
export const GameCardSkeleton: React.FC = () => (
  <div className="bg-gray-800 rounded-lg p-4 space-y-3">
    <div className="flex justify-between items-start">
      <Skeleton variant="text" width="60%" height={20} />
      <Skeleton variant="rectangular" width={60} height={24} rounded />
    </div>
    <Skeleton variant="text" width="40%" />
    <div className="flex gap-2">
      <Skeleton variant="circular" width={24} height={24} />
      <Skeleton variant="circular" width={24} height={24} />
      <Skeleton variant="circular" width={24} height={24} />
    </div>
    <div className="flex justify-between">
      <Skeleton variant="text" width="30%" />
      <Skeleton variant="text" width="25%" />
    </div>
  </div>
)

export const PlayerListSkeleton: React.FC = () => (
  <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
    <Skeleton variant="circular" width={40} height={40} />
    <div className="flex-1 space-y-2">
      <Skeleton variant="text" width="50%" />
      <Skeleton variant="text" width="30%" height={12} />
    </div>
    <Skeleton variant="rectangular" width={80} height={32} rounded />
  </div>
)

export const LeaderboardRowSkeleton: React.FC = () => (
  <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-lg">
    <Skeleton variant="text" width={30} />
    <Skeleton variant="circular" width={48} height={48} />
    <div className="flex-1 space-y-2">
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="text" width="25%" height={14} />
    </div>
    <div className="flex gap-8">
      <Skeleton variant="text" width={60} />
      <Skeleton variant="text" width={60} />
      <Skeleton variant="text" width={80} />
    </div>
  </div>
)

export const TerritoryCardSkeleton: React.FC = () => (
  <div className="bg-gray-800 rounded-lg p-3 space-y-2">
    <Skeleton variant="rectangular" width="100%" height={120} rounded />
    <Skeleton variant="text" width="70%" />
    <div className="flex justify-between">
      <Skeleton variant="text" width="40%" height={14} />
      <Skeleton variant="text" width="30%" height={14} />
    </div>
  </div>
)