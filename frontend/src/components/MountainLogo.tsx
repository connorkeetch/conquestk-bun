interface MountainLogoProps {
  width?: number
  height?: number
  className?: string
}

export default function MountainLogo({ width = 60, height = 60, className = '' }: MountainLogoProps) {
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 60 60" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className}`}
      style={{
        filter: 'drop-shadow(0 0 2px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 8px rgba(147, 51, 234, 0.9)) drop-shadow(0 0 16px rgba(147, 51, 234, 0.6)) drop-shadow(0 0 24px rgba(147, 51, 234, 0.3))'
      }}
    >
      <defs>
        <linearGradient id="loneGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" style={{stopColor:"#1F2937"}} />
          <stop offset="70%" style={{stopColor:"#4B5563"}} />
          <stop offset="100%" style={{stopColor:"#9CA3AF"}} />
        </linearGradient>
      </defs>
      
      {/* Jagged Lone Peak profile (lowered peak) */}
      <path 
        d="M 8 52 
           L 16 38
           L 20 40
           L 24 34
           L 26 30
           L 28 26
           L 29 22
           L 30 18
           L 31 22
           L 32 26
           L 34 30
           L 36 34
           L 40 40
           L 44 38
           L 52 52
           Z" 
        fill="url(#loneGrad)"
      />
      
      {/* Subtle ridge lines for texture */}
      <line x1="30" y1="18" x2="28" y2="38" stroke="#1F2937" strokeWidth="0.5" opacity="0.4"/>
      <line x1="30" y1="18" x2="32" y2="38" stroke="#1F2937" strokeWidth="0.5" opacity="0.4"/>
      
      {/* Minimal snow */}
      <path d="M 30 18 L 33 24 L 30 22 L 27 24 Z" fill="white" opacity="0.85"/>
      
      {/* Flag pole */}
      <line x1="30" y1="18" x2="30" y2="9" stroke="#4B5563" strokeWidth="1.5"/>
      
      {/* Waving flag (now red) */}
      <path d="M 30 9 Q 36 11, 39 9 L 39 14 Q 36 16, 30 13 Z" fill="#E74C3C"/>
      
      {/* Optional K on flag */}
      <text x="34" y="12.5" fontFamily="Arial" fontSize="3.5" fontWeight="bold" fill="white">K</text>
    </svg>
  )
}