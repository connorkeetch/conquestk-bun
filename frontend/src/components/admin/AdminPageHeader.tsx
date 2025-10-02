import type { ReactNode } from 'react'

interface AdminPageHeaderProps {
  title: string
  subtitle?: string
  icon?: string
  actions?: ReactNode
}

export function AdminPageHeader({ title, subtitle, icon, actions }: AdminPageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            {icon ? (
              <span className="text-2xl" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <span>{title}</span>
          </h1>
          {subtitle ? <p className="text-muted max-w-3xl">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  )
}
