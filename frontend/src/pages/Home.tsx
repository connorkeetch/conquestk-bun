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
      title: 'Strategic Battles',
      description: 'Authentic dice mechanics with tactical combat',
      status: 'available',
    },
    {
      icon: '🎨',
      title: 'Map Editor',
      description: 'Design custom battlefields with advanced tools',
      status: 'available',
    },
    {
      icon: '👥',
      title: 'Massive Multiplayer Wars',
      description: 'Epic battles with up to 12 conquerors',
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
      title: 'Casual & Ranked War Rooms',
      description:
        'Jump into real-time matches with ready-checks, lifecycle enforcement, and authoritative battle history.',
      meta: 'Powered by live delta streaming',
    },
    {
      icon: '🗺️',
      title: 'Custom Map Showdowns',
      description:
        'Host games on official or community maps with sector bonuses, capital rules, and team alliances.',
      meta: 'Up to 12 commanders per battle',
    },
    {
      icon: '🏗️',
      title: 'Creator Playground',
      description:
        'Design, iterate, and publish new arenas in the map editor—territories, sectors, and adjacencies included.',
      meta: 'Review and approval workflow built-in',
    },
  ]

  interface Highlight {
    title: string
    description: string
    bullets: string[]
  }

  const highlights: Highlight[] = [
    {
      title: 'Competitive infrastructure',
      description:
        'Every match is tracked, ranked, and backed by the same systems we use internally.',
      bullets: [
        'Authoritative game archival captures every dice roll and territory swing.',
        'CP ladders, win streaks, and performance stats update the moment a battle ends.',
        'Lifecycle engine enforces lobby → active → completed states with ready-checks.',
      ],
    },
    {
      title: 'Creator tools that scale',
      description:
        'Build worlds with the same workflows moderators use to review and ship official maps.',
      bullets: [
        'Advanced editor manages territories, sectors, bonuses, and adjacency in one place.',
        'Versioned drafts flow through review queues before they reach the live rotation.',
        'Automated asset lifecycle keeps staging buckets tidy as maps evolve.',
      ],
    },
    {
      title: 'Player-first experience',
      description: 'Stay connected from the moment a lobby opens to the final domination screen.',
      bullets: [
        'Turn notifications and push alerts keep your army ready to strike.',
        'In-game chat, DMs, and moderation tools respect authenticated identities.',
        'Theme system, audio cues, and accessibility presets keep the board readable for every commander.',
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
        'Real-time delta streaming, lifecycle enforcement, and battle archival now power every match.',
    },
    {
      title: 'Map authoring security',
      status: 'in-progress',
      description:
        'Locking down collaborator permissions and approvals to protect community-created maps.',
    },
    {
      title: 'Creator notifications',
      status: 'in-progress',
      description:
        'Rolling out push + socket alerts so reviewers and authors get updates the moment decisions land.',
    },
    {
      title: 'Advanced game modes',
      status: 'up-next',
      description:
        'Assassin, Zombie Apocalypse, King of the Hill, and more once core workflows finish hardening.',
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
            Strategic Warfare{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-violet-400">
              Redefined
            </span>
          </h1>

          {/* Tighter Value Proposition */}
          <p className="mt-3 mx-auto max-w-[42ch] text-white/80 text-center text-lg md:text-xl">
            Command armies. Conquer territories. Dominate the battlefield.
          </p>

          {/* Clearer Primary Action */}
          <div className="mt-7 flex items-center justify-center gap-3">
            {isAuthenticated ? (
              <>
                <Link to="/lobby" className="btn-primary btn-lg">
                  ⚡ Start Playing →
                </Link>
                <Link to="/map-editor" className="btn-secondary btn-lg">
                  Map Editor
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className="btn-primary btn-lg">
                  Join the War →
                </Link>
                <Link to="/login" className="btn-secondary btn-lg">
                  Login
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
            className="relative h-80 md:h-[500px] rounded-2xl border border-white/10 p-12
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
            <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/60 to-black/80 rounded-2xl"></div>

            {/* Subtle gradient overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent rounded-2xl"></div>

            {/* Battle Text Overlay */}
            <div className="relative z-10 text-center px-8">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <span className="bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
                  CONQUER THE WORLD
                </span>
              </h2>
              <p className="text-xl text-muted max-w-2xl mx-auto">
                Deploy armies • Capture territories • Achieve total domination
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
              <span className="text-white">Core Features</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group min-h-[96px] rounded-xl border border-white/10 bg-white/[.05] p-5
                         hover:bg-white/[.07] hover:-translate-y-0.5 transition will-change-transform"
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
              Whether you are climbing the ladder or hosting private wars, ConquestK has a room for
              you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {gameExperiences.map((experience) => (
              <div
                key={experience.title}
                className="rounded-xl border border-white/10 bg-white/[.06] p-5 flex flex-col gap-4"
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
                  <p className="text-xs uppercase tracking-wide text-white/60 bg-white/5 border border-white/10 inline-flex px-3 py-1 rounded-full">
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
              The platform is engineered for competitive clarity, creator freedom, and reliable
              operations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {highlights.map((highlight) => (
              <div
                key={highlight.title}
                className="rounded-xl border border-white/10 bg-white/[.05] p-5 text-left"
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
              We build in the open. Here is what just shipped, what is underway, and what is queued
              next.
            </p>
          </div>

          <div className="space-y-4">
            {roadmap.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-white/10 bg-white/[.04] p-5 md:p-6 flex flex-col md:flex-row md:items-center md:gap-6"
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
              Master these three fundamentals to become a legendary commander
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[.07] p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                1
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Deploy Strategically</h3>
              <p className="text-white/70 text-sm">
                Position forces across chokepoints and key territories
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[.07] p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                2
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Attack & Defend</h3>
              <p className="text-white/70 text-sm">
                Time your strikes and fortify vulnerable positions
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[.07] p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                3
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Claim Victory</h3>
              <p className="text-white/70 text-sm">Adapt your strategy and conquer the world</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 section-spacing">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-slate-900/80 p-8 md:p-12 text-center">
            <h2 className="text-3xl font-bold text-white">Ready to command your next war?</h2>
            <p className="mt-4 text-white/80 text-base md:text-lg">
              The beta is live today. Rally your allies, draft a new map, or drop into matchmaking
              and climb the ladder.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              {isAuthenticated ? (
                <>
                  <Link to="/lobby" className="btn-primary btn-lg w-full sm:w-auto">
                    Resume the fight
                  </Link>
                  <Link to="/maps" className="btn-secondary btn-lg w-full sm:w-auto">
                    Explore maps
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/register" className="btn-primary btn-lg w-full sm:w-auto">
                    Join ConquestK
                  </Link>
                  <Link to="/learn" className="btn-secondary btn-lg w-full sm:w-auto">
                    Learn more
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
