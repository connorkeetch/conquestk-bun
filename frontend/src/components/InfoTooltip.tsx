import type { HTMLAttributes } from 'react'

type InfoTooltipProps = {
  title: string
  className?: string
} & HTMLAttributes<HTMLSpanElement>

export default function InfoTooltip({ title, className = '', ...rest }: InfoTooltipProps) {
  return (
    <span
      className={`ml-1 inline-flex select-none items-center text-xs text-muted cursor-help ${className}`}
      title={title}
      aria-hidden={false}
      {...rest}
    >
      ⓘ
    </span>
  )
}
