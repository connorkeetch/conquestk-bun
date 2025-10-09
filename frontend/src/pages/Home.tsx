import type React from 'react'
import { Link } from 'react-router-dom'
import { resolveAssetPath } from '@/utils/assets'
import { useAppSelector } from '../hooks/redux'

interface Feature {
  icon: string
  title: string
  description: string
  status: 'available' | 'coming-soon'
}

const Home: React.FC = () => {
  const { isAuthenticated } = useAppSelector((state) => state.auth)

  const heroBackground = resolveAssetPath('static/images/world-map-hero.jpg')

  const features: Feature[] = [
    {
      icon: '⚔️',
      title: 'Authoritative Warfare',
      description:
        'Server-enforced dice rolls, combat logs, and anti-cheese guardrails keep every invasion legit.',
      status: 'available',
    },
    {
      icon: '🎨',
      title: 'War Forge',
      description:
        'Build and publish worlds with the same tooling our map moderators wield—bonuses, adjacencies, the whole arsenal.',
      status: 'available',
    },
    {
      icon: '👥',
      title: '12-Player Chaos',
      description:
        'Party up with alliances, betrayals, and simultaneous screams as sockets synchronize every move.',
      status: 'available',
    },
  ]

  interface GameExperience {
    icon: string
    title: string
    description: string
    meta: string
  }

  const gameExperiences: GameExperience[] = [
    {
      icon: '🛡️',
      title: 'Ranked War Rooms',
      description:
        'Ready-check, deploy, and grind CP on servers that document every die you throw and every territory you torch.',
      meta: 'Live delta streaming keeps the carnage in sync',
    },
    {
      icon: '🗺️',
      title: 'Custom Map Sieges',
      description:
        'Spin up lobbies on official rotations or community fever dreams with capital rules, alliances, and fog of war toggles.',
      meta: 'Up to 12 commanders per battlefield',
    },
    {
      icon: '🏗️',
      title: 'Creator Foundry',
      description:
        'Draft, iterate, and submit new arenas with full version history, reviewer feedback, and instant staging previews.',
      meta: 'Moderation workflow built straight into the editor',
    },
  ]

  interface Highlight {
    title: string
    description: string
    bullets: string[]
  }

  const highlights: Highlight[] = [
    {
      title: 'Battle telemetry',
      description:
        'Our servers notarize every die, treaty, and betrayal so post-game tribunals can replay the carnage frame-by-frame.',
      bullets: [
        'Authoritative archives track territory swings, card cash-ins, and bonus math in real time.',
        'Rank ladders recalculate CP, streaks, and hidden MMR the moment the final stronghold falls.',
        'Lifecycle enforcement keeps lobbies honest from ready-check to victory parade.',
      ],
    },
    {
      title: 'Creator logistics',
      description:
        'Moderated pipelines let you prototype a continent in the morning and ship it to the rotation before dinner.',
      bullets: [
        'Visual editor wrangles territories, sectors, and adjacency matrices without touching JSON.',
        'Review queues capture inline feedback, approvals, and rejection reasons automatically.',
        'Asset lifecycle sweeps staging buckets so your CDN only serves fresh propaganda.',
      ],
    },
    {
      title: 'Commander quality of life',
      description:
        'Stay locked in with alerts, comms, and accessibility tuned for war councils and night-owls alike.',
      bullets: [
        'Push notifications, turn pings, and ready-check reminders prevent AFK disasters.',
        'Chat, clans, and reporting tools tie every message to an authenticated identity.',
        'Theme presets, audio cues, and contrast-friendly overlays keep fog-of-war legible.',
      ],
    },
  ]

  type RoadmapStatus = 'complete' | 'in-progress' | 'up-next'

  interface RoadmapItem {
    title: string
    status: RoadmapStatus
    description: string
  }

  const roadmap: RoadmapItem[] = [
    {
      title: 'Live multiplayer core',
      status: 'complete',
      description:
        'Sockets stream deltas in milliseconds while lifecycle rules boot deserters and archive the aftermath.',
    },
    {
      title: 'Map authoring security',
      status: 'in-progress',
      description:
        'Role-based locks, audit trails, and collaborator approvals are hardening the community map pipeline.',
    },
    {
      title: 'Creator notifications',
      status: 'in-progress',
      description:
        'Push alerts and socket toasts are rolling out so reviewers and authors get verdicts instantly.',
    },
    {
      title: 'Advanced game modes',
      status: 'up-next',
      description:
        'Assassin contracts, Zombie Apocalypse, and King of the Hill await final balance passes before deployment.',
    },
  ]

  const roadmapStatusStyles: Record<RoadmapStatus, { label: string; classes: string }> = {
    complete: {
      label: 'Shipped',
      classes: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30',
    },
    'in-progress': {
      label: 'In progress',
      classes: 'bg-sky-500/15 text-sky-300 border border-sky-400/30',
    },
    'up-next': {
      label: 'Up next',
      classes: 'bg-amber-500/15 text-amber-300 border border-amber-400/30',
    },
  }

  return (
    <div className="min-h-screen">
      {/* Optimized Hero Section */}
      <section className="overflow-hidden section-spacing">
        {/* Constrained Content Container */}
        <div className="relative container mx-auto px-6 max-w-6xl flex flex-col items-center">
          {/* Standardized Hero Title */}
          <h1 className="mt-2 text-[clamp(2rem,3.8vw,3.5rem)] font-bold leading-tight text-white text-center">
            Welcome to the{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-violet-400">
              Galactic War Council
            </span>
          </h1>

          {/* Tighter Value Proposition */}
          <p className="mt-3 mx-auto max-w-[52ch] text-white/80 text-center text-lg md:text-xl">
            Draft orders, break treaties, and steamroll the map—ConquestK tracks every glorious{' '}
            betrayal for history.
          </p>

          {/* Clearer Primary Action */}
          <div className="mt-7 flex items-center justify-center gap-3">
            {isAuthenticated ? (
              <>
                <Link to="/lobby" className="btn-primary btn-lg">
                  ⚡ Deploy Troops →
                </Link>
                <Link to="/map-editor" className="btn-secondary btn-lg">
                  Forge a Map
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className="btn-primary btn-lg">
                  Enlist Today →
                </Link>
                <Link to="/login" className="btn-secondary btn-lg">
                  Veteran Login
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Epic Battle Image Section - Simplified */}
      <section className="relative z-10 section-spacing-sm overflow-hidden">
        <div className="container mx-auto px-6 max-w-6xl">
          {/* Single container with world map background */}
          <div
            className="relative h-80 md:h-[500px] rounded-2xl border border-border p-12
                      shadow-[inset_0_1px_0_0_rgba(255,255,255,.06)]
                      flex items-center justify-center overflow-hidden"
            style={{
              backgroundImage: `url('${heroBackground}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          >
            {/* Dark overlay for better text contrast */}
            <div className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--surface-1)_80%,black)] rounded-2xl"></div>

            {/* Subtle gradient overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-t from-[color:color-mix(in_srgb,black_50%,transparent)] via-transparent to-transparent rounded-2xl"></div>

            {/* Battle Text Overlay */}
            <div className="relative z-10 text-center px-8">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <span className="bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
                  CONQUER THE WORLD
                </span>
              </h2>
              <p className="text-xl text-muted max-w-2xl mx-auto">
                Deploy armies • Capture capitals • Trigger global domination alerts
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Equal Height & Cleaner */}
      <section className="relative z-10 section-spacing-sm">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold">
              <span className="text-white">Battlefield Systems</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group min-h-[96px] rounded-xl border border-border bg-surface-2/50 p-5
                         hover:bg-surface-2/70 hover:-translate-y-0.5 transition will-change-transform"
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">{feature.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-white font-medium">{feature.title}</h4>
                      {feature.status === 'coming-soon' && (
                        <span className="ml-auto text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-white/70">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Play Modes & Tools */}
      <section className="relative z-10 section-spacing-sm">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              <span className="text-white">Play your way</span>
            </h2>
            <p className="text-muted text-sm">
              Ladder sweat, casual treaties, or clan scrims—we have a lobby ready for every flavor
              of conquest.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {gameExperiences.map((experience) => (
              <div
                key={experience.title}
                className="rounded-xl border border-border bg-surface-2/60 p-5 flex flex-col gap-4"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl" aria-hidden="true">
                    {experience.icon}
                  </span>
                  <div>
                    <h3 className="text-lg font-medium text-white">{experience.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{experience.description}</p>
                  </div>
                </div>
                <div className="mt-auto">
                  <p className="text-xs uppercase tracking-wide text-muted bg-surface-1/50 border border-border inline-flex px-3 py-1 rounded-full">
                    {experience.meta}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Strategic Pillars */}
      <section className="relative z-10 section-spacing-sm">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              <span className="text-white">Why commanders stay</span>
            </h2>
            <p className="text-muted text-sm">
              Built for commanders who crave receipts, tools, and uptime when the invasion clock
              hits zero.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {highlights.map((highlight) => (
              <div
                key={highlight.title}
                className="rounded-xl border border-border bg-surface-2/50 p-5 text-left"
              >
                <h3 className="text-lg font-medium text-white">{highlight.title}</h3>
                <p className="mt-2 text-sm text-white/70">{highlight.description}</p>
                <ul className="mt-4 space-y-3">
                  {highlight.bullets.map((bullet) => (
                    <li
                      key={`${highlight.title}-${bullet}`}
                      className="flex items-start gap-2 text-sm text-white/70"
                    >
                      <span className="text-sky-300 mt-0.5" aria-hidden="true">
                        ●
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap Snapshot */}
      <section className="relative z-10 section-spacing-sm">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              <span className="text-white">Roadmap snapshot</span>
            </h2>
            <p className="text-muted text-sm">
              We broadcast the roadmap so you know what the engineering corps is weaponizing next.
            </p>
          </div>

          <div className="space-y-4">
            {roadmap.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-border bg-surface-2/40 p-5 md:p-6 flex flex-col md:flex-row md:items-center md:gap-6"
              >
                <div className="flex items-center gap-3 mb-4 md:mb-0">
                  <span className="text-white text-lg font-medium">{item.title}</span>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${roadmapStatusStyles[item.status].classes}`}
                  >
                    {roadmapStatusStyles[item.status].label}
                  </span>
                </div>
                <p className="text-sm text-white/70 md:flex-1">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works - Streamlined */}
      <section className="relative z-10 section-spacing-sm">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              <span className="text-white">How to Dominate</span>
            </h2>
            <p className="text-muted text-sm">
              Master these three fundamentals to keep your troops cheering instead of mutinying.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-surface-2/70 p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                1
              </div>
              <h3 className="text-lg font-medium text-heading mb-2">Deploy Like a Menace</h3>
              <p className="text-muted text-sm">
                Stack capitals, guard borders, and leave just enough bait to lure foolish
                counterattacks.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-2/70 p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                2
              </div>
              <h3 className="text-lg font-medium text-heading mb-2">Roll the Bones</h3>
              <p className="text-muted text-sm">
                Blitz when the odds peak, turtle when the dice betray you, and rotate fronts before
                the map catches fire.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-2/70 p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                3
              </div>
              <h3 className="text-lg font-medium text-heading mb-2">Broadcast Supremacy</h3>
              <p className="text-muted text-sm">
                Cash cards, trigger domination, and screen-cap the results before rivals spin the
                narrative.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 section-spacing">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="rounded-2xl border border-border bg-surface-2/60 p-8 md:p-12 text-center">
            <h2 className="text-3xl font-bold text-white">
              Command wants to know: are you invading tonight?
            </h2>
            <p className="mt-4 text-white/80 text-base md:text-lg">
              The live beta is online. Rally your squad, draft a fresh map, or queue solo and claim
              the top of the CP charts.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              {isAuthenticated ? (
                <>
                  <Link to="/lobby" className="btn-primary btn-lg w-full sm:w-auto">
                    Rejoin the Front
                  </Link>
                  <Link to="/maps" className="btn-secondary btn-lg w-full sm:w-auto">
                    Inspect Warzones
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/register" className="btn-primary btn-lg w-full sm:w-auto">
                    Sign the Enlistment Papers
                  </Link>
                  <Link to="/learn" className="btn-secondary btn-lg w-full sm:w-auto">
                    Review Field Manual
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
