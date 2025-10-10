import type React from 'react'
import { useEffect, useState } from 'react'
import achievementsService, {
  type Achievement,
  type AchievementsResponse,
  type UserAchievement,
} from '@/services/achievementsService'
import { resolveAssetPath } from '@/utils/assets'

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'

const toSlug = (name?: string): string =>
  (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const BadgeIcon: React.FC<{ icon?: string; name: string }> = ({ icon, name }) => {
  // If icon looks like an emoji, render as text; otherwise try to resolve as asset path
  const isEmoji = icon && /\p{Emoji}/u.test(icon)
  if (isEmoji) {
    return (
      <span className="text-3xl" aria-hidden>
        {icon}
      </span>
    )
  }

  const slug = toSlug(name)
  const src = icon || resolveAssetPath(`achievements/${slug}.svg`)
  return (
    <img
      src={src}
      alt={`${name} badge`}
      className="w-10 h-10 object-contain opacity-90"
      onError={(e) => {
        // Fallback to trophy emoji if image fails
        const el = e.currentTarget
        el.style.display = 'none'
        const sibling = document.createElement('span')
        sibling.textContent = '🏆'
        sibling.className = 'text-3xl'
        el.parentElement?.appendChild(sibling)
      }}
    />
  )
}

interface Props {
  className?: string
}

const AchievementsPanel: React.FC<Props> = ({ className = '' }) => {
  const [state, setState] = useState<LoadState>('idle')
  const [data, setData] = useState<AchievementsResponse>({ unlocked: [], available: [] })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const run = async () => {
      try {
        setState('loading')
        setError(null)
        const res = await achievementsService.getMyAchievements(controller.signal)
        setData(res)
        setState('loaded')
      } catch (_err) {
        setError('Unable to load achievements')
        setState('error')
      }
    }

    void run()
    return () => controller.abort()
  }, [])

  const renderCard = (
    a: (Achievement | UserAchievement) & { unlocked_at?: string },
    unlocked: boolean,
  ) => {
    const name = (a as Achievement).name || 'Achievement'
    const description = (a as Achievement).description || ''
    const icon = (a as Achievement).icon ?? (a as UserAchievement).icon ?? undefined

    return (
      <div
        key={(a as Achievement).id || (a as UserAchievement).achievement_id}
        className={`glass-box-sm border bg-surface-2/70 p-4 flex items-start gap-3 ${
          unlocked ? 'border-emerald-500/30' : 'border-white/10'
        }`}
      >
        <div className="shrink-0">
          <BadgeIcon name={name} {...(icon ? { icon } : {})} />
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <h4 className="text-white font-semibold">{name}</h4>
            {unlocked && (
              <span className="text-emerald-300 text-xs px-2 py-0.5 rounded-full border border-emerald-400/50 bg-emerald-500/10">
                Unlocked
              </span>
            )}
          </div>
          <div className="text-muted text-sm">{description}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {state === 'loading' && (
        <div className="text-center text-muted py-8">Loading achievements…</div>
      )}
      {state === 'error' && <div className="text-center text-danger py-8">{error}</div>}
      {state === 'loaded' && (
        <div className="space-y-8">
          {data.unlocked.length > 0 && (
            <section>
              <h3 className="text-lg font-bold text-white mb-3">Unlocked</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.unlocked.map((ua) => renderCard(ua, true))}
              </div>
            </section>
          )}
          <section>
            <h3 className="text-lg font-bold text-white mb-3">All Achievements</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.available.map((a) => renderCard(a, false))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default AchievementsPanel
