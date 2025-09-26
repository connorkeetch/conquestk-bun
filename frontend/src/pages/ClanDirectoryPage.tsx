import { Compass, Filter, Loader2, MapPin, Search, Shield, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
// Clans directory is always enabled
import { clanApi } from '@/services/clanService'
import type { ClanListFilters, ClanListResponse, ClanSummary } from '@/types/clans'
import { logger } from '@/utils/logger'

const DEFAULT_LIMIT = 20

const recruitmentFilters: Array<{
  label: string
  value: ClanListFilters['recruitmentStatus']
}> = [
  { label: 'Any status', value: undefined },
  { label: 'Actively recruiting', value: 'active' },
  { label: 'Closed', value: 'closed' },
]

const privacyFilters: Array<{ label: string; value: ClanListFilters['privacy'] }> = [
  { label: 'Any privacy', value: undefined },
  { label: 'Public', value: 'public' },
  { label: 'Hidden', value: 'hidden' },
]

const formatMemberCount = (count: number): string => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  return String(count)
}

const ClanSummaryCard = ({ clan }: { clan: ClanSummary }) => {
  const createdAt = useMemo(() => new Date(clan.createdAt), [clan.createdAt])

  return (
    <Link to={`/clans/${clan.slug}`} className="block group">
      <div className="glass-box-lg p-6 h-full transition-all group-hover:border-primary/40 group-hover:shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium uppercase tracking-widest text-primary-soft">
                {clan.tag}
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success">
                Level {clan.level}
              </span>
            </div>
            <h3 className="mt-2 text-2xl font-semibold text-white">{clan.name}</h3>
            {clan.motto && <p className="mt-1 text-muted text-sm">{clan.motto}</p>}
          </div>
          {clan.crestAssetUrl ? (
            <img
              src={clan.crestAssetUrl}
              alt={`${clan.name} crest`}
              className="w-16 h-16 rounded-full object-cover border border-white/10"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-surface-3 flex items-center justify-center border border-white/10">
              <Shield className="w-7 h-7 text-primary-soft" />
            </div>
          )}
        </div>

        {clan.description && (
          <p className="mt-4 text-muted line-clamp-3 leading-relaxed">{clan.description}</p>
        )}

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-muted">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-soft" />
            <span>
              <span className="text-white font-medium">{formatMemberCount(clan.memberCount)}</span>{' '}
              members
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary-soft" />
            <span>{clan.region ? clan.region : 'Region agnostic'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-primary-soft" />
            <span>
              Founded {createdAt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-muted uppercase tracking-[0.2em]">
          <span>
            {clan.recruitmentPolicy === 'open' ? 'Open enrollment' : 'Application required'}
          </span>
          <span>{clan.recruitmentStatus === 'active' ? 'Recruiting' : 'Closed'}</span>
        </div>
      </div>
    </Link>
  )
}

const createInitialFilters = (): ClanListFilters => ({ limit: DEFAULT_LIMIT })

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Something went wrong while loading clans.'
}

const ClanDirectoryPage = () => {
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('')
  const [recruitmentStatus, setRecruitmentStatus] = useState<ClanListFilters['recruitmentStatus']>()
  const [privacy, setPrivacy] = useState<ClanListFilters['privacy']>()
  const [activeFilters, setActiveFilters] = useState<ClanListFilters>(createInitialFilters)
  const [clans, setClans] = useState<ClanSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadClans = useCallback(async (filters: ClanListFilters, append = false) => {
    try {
      const response: ClanListResponse = await clanApi.listClans(filters)
      setError(null)
      setNextCursor(response.nextCursor ?? null)
      setClans((prev) => (append ? [...prev, ...response.clans] : response.clans))
    } catch (err) {
      const message = extractErrorMessage(err)
      setError(message)
      logger.error('Failed to load clans', err)
      if (!append) {
        setClans([])
        setNextCursor(null)
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchInitial = async () => {
      setIsLoading(true)
      try {
        const response = await clanApi.listClans(activeFilters)
        if (!isMounted) return
        setClans(response.clans)
        setNextCursor(response.nextCursor ?? null)
        setError(null)
      } catch (err) {
        if (!isMounted) return
        const message = extractErrorMessage(err)
        setError(message)
        setClans([])
        setNextCursor(null)
        logger.error('Failed to fetch clan list', err)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchInitial()

    return () => {
      isMounted = false
    }
  }, [activeFilters])

  const handleFilterSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextFilters: ClanListFilters = {
      search: search.trim() || undefined,
      region: region.trim() || undefined,
      recruitmentStatus,
      privacy,
      limit: DEFAULT_LIMIT,
    }
    setActiveFilters(nextFilters)
  }

  const handleResetFilters = () => {
    setSearch('')
    setRegion('')
    setRecruitmentStatus(undefined)
    setPrivacy(undefined)
    setActiveFilters(createInitialFilters())
  }

  const handleLoadMore = async () => {
    if (!nextCursor) return
    setIsLoadingMore(true)
    const filters = { ...activeFilters, cursor: nextCursor }
    await loadClans(filters, true)
    setIsLoadingMore(false)
  }

  // No feature gating

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-primary-soft">Community Hub</p>
            <h1 className="mt-2 text-4xl font-bold text-white">Find your perfect clan</h1>
            <p className="mt-3 text-muted max-w-2xl">
              Browse active clans, explore their mission statements, and request to join the squads
              that match your strategy.
            </p>
          </div>
        </header>

        <form onSubmit={handleFilterSubmit} className="glass-box-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or tag"
                className="input-field pl-10"
              />
            </label>
            <label className="relative flex items-center">
              <MapPin className="absolute left-3 w-4 h-4 text-muted" />
              <input
                type="text"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder="Region (e.g. NA, EU)"
                className="input-field pl-10"
              />
            </label>
            <label className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted" />
              <select
                value={recruitmentStatus ?? ''}
                onChange={(event) =>
                  setRecruitmentStatus(
                    event.target.value
                      ? (event.target.value as ClanListFilters['recruitmentStatus'])
                      : undefined,
                  )
                }
                className="input-field"
              >
                {recruitmentFilters.map((option) => (
                  <option key={option.label} value={option.value ?? ''}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted" />
              <select
                value={privacy ?? ''}
                onChange={(event) =>
                  setPrivacy(
                    event.target.value
                      ? (event.target.value as ClanListFilters['privacy'])
                      : undefined,
                  )
                }
                className="input-field"
              >
                {privacyFilters.map((option) => (
                  <option key={option.label} value={option.value ?? ''}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.3em] text-muted flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filters active
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleResetFilters} className="btn-secondary">
                Reset
              </button>
              <button type="submit" className="btn-primary">
                Apply Filters
              </button>
            </div>
          </div>
        </form>

        {isLoading ? (
          <div className="glass-box-lg p-16 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary-soft mx-auto mb-4" />
            <p className="text-muted">Loading clans...</p>
          </div>
        ) : error ? (
          <div className="glass-box-lg p-10 text-center max-w-2xl mx-auto">
            <Shield className="w-10 h-10 text-danger mx-auto mb-4" />
            <p className="text-white font-medium mb-2">We couldn't load clans right now.</p>
            <p className="text-muted text-sm mb-6">{error}</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setActiveFilters({ ...activeFilters })}
            >
              Try again
            </button>
          </div>
        ) : clans.length === 0 ? (
          <div className="glass-box-lg p-10 text-center">
            <Users className="w-12 h-12 text-muted mx-auto mb-4" />
            <p className="text-lg text-white font-medium mb-2">No clans matched your filters</p>
            <p className="text-muted">
              Adjust the search filters or check back soon as more commanders rally.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {clans.map((clan) => (
              <ClanSummaryCard key={clan.id} clan={clan} />
            ))}
          </div>
        )}

        {nextCursor && !isLoading && clans.length > 0 && (
          <div className="flex justify-center">
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Load more clans
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ClanDirectoryPage
