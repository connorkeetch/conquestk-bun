import { Compass, Filter, Loader2, MapPin, Search, Shield, Users } from 'lucide-react'
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
// Clans directory is always enabled
import { useAppSelector } from '@/hooks/redux'
import { clanApi } from '@/services/clanService'
import type {
  ClanCreateRequest,
  ClanListFilters,
  ClanListResponse,
  ClanPrivacy,
  ClanRecruitmentPolicy,
  ClanRecruitmentStatus,
  ClanSummary,
} from '@/types/clans'
import { logger } from '@/utils/logger'

const DEFAULT_LIMIT = 20

type CreateClanFormState = {
  name: string
  tag: string
  motto: string
  description: string
  region: string
  recruitmentPolicy: ClanRecruitmentPolicy
  recruitmentStatus: ClanRecruitmentStatus
  privacy: ClanPrivacy
}

const createInitialClanForm = (): CreateClanFormState => ({
  name: '',
  tag: '',
  motto: '',
  description: '',
  region: '',
  recruitmentPolicy: 'open',
  recruitmentStatus: 'active',
  privacy: 'public',
})

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
    <Link to={`/community/clans/${clan.slug}`} className="block group">
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
  if (error && typeof error === 'object') {
    const maybeAxios = error as {
      response?: {
        data?: {
          message?: string
          errors?: Array<{ msg?: string | null | undefined }>
        }
      }
      message?: string
    }

    const axiosMessage = maybeAxios.response?.data?.message
    if (typeof axiosMessage === 'string' && axiosMessage.trim().length > 0) {
      return axiosMessage
    }

    const validationMessage = maybeAxios.response?.data?.errors?.find((item) => {
      return typeof item?.msg === 'string' && (item.msg as string).trim().length > 0
    })?.msg

    if (typeof validationMessage === 'string' && validationMessage.trim().length > 0) {
      return validationMessage
    }

    if (typeof maybeAxios.message === 'string' && maybeAxios.message.trim().length > 0) {
      return maybeAxios.message
    }
  }

  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Something went wrong while loading clans.'
}

const ClanDirectoryPage = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useAppSelector((state) => state.auth)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<CreateClanFormState>(createInitialClanForm)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isSubmittingClan, setIsSubmittingClan] = useState(false)
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

  const toggleCreateForm = () => {
    setShowCreateForm((prev) => {
      const next = !prev
      if (!next) {
        setCreateForm(createInitialClanForm())
        setCreateError(null)
      }
      return next
    })
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setShowCreateForm(false)
      setCreateForm(createInitialClanForm())
      setCreateError(null)
    }
  }, [isAuthenticated])

  const handleCreateInputChange =
    <T extends keyof CreateClanFormState>(field: T) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { value } = event.target
      setCreateForm((prev) => ({ ...prev, [field]: value as CreateClanFormState[T] }))
      setCreateError(null)
    }

  const handleTagChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.toUpperCase()
    setCreateForm((prev) => ({ ...prev, tag: value }))
    setCreateError(null)
  }

  const handleCreateClan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!isAuthenticated) {
      setCreateError('You need to log in to create a clan.')
      return
    }

    const trimmedName = createForm.name.trim()
    if (trimmedName.length < 3) {
      setCreateError('Clan name must be at least 3 characters long.')
      return
    }
    if (trimmedName.length > 64) {
      setCreateError('Clan name cannot exceed 64 characters.')
      return
    }

    const sanitizedTag = createForm.tag.trim().toUpperCase()
    if (sanitizedTag.length < 2 || sanitizedTag.length > 5) {
      setCreateError('Clan tag must be between 2 and 5 characters.')
      return
    }

    const trimmedMotto = createForm.motto.trim()
    if (trimmedMotto.length > 120) {
      setCreateError('Clan motto must be 120 characters or fewer.')
      return
    }

    const trimmedDescription = createForm.description.trim()
    if (trimmedDescription.length > 1024) {
      setCreateError('Clan description must be 1024 characters or fewer.')
      return
    }

    const trimmedRegion = createForm.region.trim()
    if (trimmedRegion.length > 32) {
      setCreateError('Region must be 32 characters or fewer.')
      return
    }

    const payload: ClanCreateRequest = {
      name: trimmedName,
      tag: sanitizedTag,
      motto: trimmedMotto.length > 0 ? trimmedMotto : undefined,
      description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      region: trimmedRegion.length > 0 ? trimmedRegion : undefined,
      recruitmentPolicy: createForm.recruitmentPolicy,
      recruitmentStatus: createForm.recruitmentStatus,
      privacy: createForm.privacy,
    }

    setIsSubmittingClan(true)
    try {
      const clan = await clanApi.createClan(payload)
      setCreateForm(createInitialClanForm())
      setCreateError(null)
      setShowCreateForm(false)
      navigate(`/community/clans/${clan.slug}`)
    } catch (err) {
      const message = extractErrorMessage(err)
      setCreateError(message)
      logger.error('Failed to create clan', err)
    } finally {
      setIsSubmittingClan(false)
    }
  }

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

        <section className="glass-box-lg p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">Lead your own clan</h2>
              <p className="mt-2 text-muted max-w-2xl">
                Launch a new banner, define your mission, and invite allies to join your fight for
                dominance.
              </p>
            </div>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={toggleCreateForm}
                className="btn-primary self-start sm:self-auto"
                disabled={isSubmittingClan}
              >
                {showCreateForm ? 'Close form' : 'Create a clan'}
              </button>
            ) : (
              <Link
                to="/login"
                className="btn-primary inline-flex items-center justify-center self-start sm:self-auto"
              >
                Sign in to create
              </Link>
            )}
          </div>

          {!isAuthenticated && (
            <p className="text-sm text-muted">
              You need an account to found a clan. Log in or register to get started.
            </p>
          )}

          {showCreateForm && isAuthenticated && (
            <form onSubmit={handleCreateClan} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-white">Clan name</span>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={handleCreateInputChange('name')}
                    className="input-field"
                    placeholder="e.g. Dawn Vanguard"
                    maxLength={64}
                    required
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-white">Tag</span>
                  <input
                    type="text"
                    value={createForm.tag}
                    onChange={handleTagChange}
                    className="input-field uppercase"
                    placeholder="TAG"
                    maxLength={5}
                    required
                  />
                  <span className="text-xs text-muted">
                    2-5 characters, displayed across the directory.
                  </span>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-white">Motto (optional)</span>
                  <input
                    type="text"
                    value={createForm.motto}
                    onChange={handleCreateInputChange('motto')}
                    className="input-field"
                    placeholder="Your rallying cry"
                    maxLength={120}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-white">Region (optional)</span>
                  <input
                    type="text"
                    value={createForm.region}
                    onChange={handleCreateInputChange('region')}
                    className="input-field"
                    placeholder="NA, EU, Global..."
                    maxLength={32}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-white">Description (optional)</span>
                <textarea
                  value={createForm.description}
                  onChange={handleCreateInputChange('description')}
                  className="input-field min-h-[120px]"
                  placeholder="Tell other commanders what your clan is all about."
                  maxLength={1024}
                />
                <span className="text-xs text-muted">
                  Highlight your goals, preferred playstyle, and what you expect from recruits.
                </span>
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-white">Recruitment policy</span>
                  <select
                    value={createForm.recruitmentPolicy}
                    onChange={handleCreateInputChange('recruitmentPolicy')}
                    className="input-field"
                  >
                    <option value="open">Open enrollment</option>
                    <option value="application">Applications required</option>
                    <option value="invite">Invite only</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-white">Recruitment status</span>
                  <select
                    value={createForm.recruitmentStatus}
                    onChange={handleCreateInputChange('recruitmentStatus')}
                    className="input-field"
                  >
                    <option value="active">Actively recruiting</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-white">Privacy</span>
                  <select
                    value={createForm.privacy}
                    onChange={handleCreateInputChange('privacy')}
                    className="input-field"
                  >
                    <option value="public">Public directory listing</option>
                    <option value="hidden">Hidden (invite only)</option>
                  </select>
                </label>
              </div>

              {createError && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {createError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="submit"
                  className="btn-primary flex items-center gap-2"
                  disabled={isSubmittingClan}
                >
                  {isSubmittingClan && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Create clan</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={toggleCreateForm}
                  disabled={isSubmittingClan}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

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
