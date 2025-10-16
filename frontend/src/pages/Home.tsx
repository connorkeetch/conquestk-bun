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
      icon: '🛡️',
      title: 'Authoritative Warfare',
      description:
        'Dice are audited, treaties are logged, and the server plays referee so every march across the border is indisputable.',
      status: 'available',
    },
    {
      icon: '🗺️',
      title: 'Cartographer’s Arsenal',
      description:
        'Sketch continents, wire bonuses, and publish new fronts with the exact moderation workflow our map wardens rely on.',
      status: 'available',
    },
    {
      icon: '🤝',
      title: 'Diplomacy Optional',
      description:
        'Queue with allies or queue with frenemies—the lobby keeps receipts when “temporary” truces become eternal grudges.',
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
      icon: '⚔️',
      title: 'Ranked War Rooms',
      description:
        'Ready-check, deploy, and climb CP ladders on servers that notarize every contested die and border skirmish.',
      meta: 'Live delta streaming keeps every empire honest',
    },
    {
      icon: '🏰',
      title: 'Custom Map Sieges',
      description:
        'Spin up lobbies on official rotations or community fever dreams with capitals, alliances, and fog-of-war.',
      meta: 'Up to 12 commanders per battlefield',
    },
    {
      icon: '🛠️',
      title: 'Creator Foundry',
      description:
        'Draft, iterate, and submit fresh arenas with version history, reviewer feedback, and instant staging previews.',
      meta: 'Moderation workflow built into the editor',
    },
    {
      icon: '🧠',
      title: 'AI & Spectator Mode',
      description:
        'Watch grandmasters duel or face adaptive commanders who study your tactics, then replay every blunder in clarity.',
      meta: 'Machine rivals and replays for study and showdowns',
    },
  ]

  interface Highlight {
    title: string
    description: string
    bullets: string[]
  }

  const highlights: Highlight[] = [
    {
      title: 'Audited to the bone',
      description:
        'Every treaty, roll, and territory swing is stamped and queryable. Arguing about dice becomes a spectator sport.',
      bullets: [
        'Authoritative logs for attacks, card cash-ins, bonuses, and fortify paths in real time.',
        'Rank ladders recalc CP, streaks, and hidden MMR on match close.',
        'Exportable match reports and per-turn diffs for post-war tribunals.',
      ],
    },
    {
      title: 'Fair play enforced',
      description:
        'Lobbies run with ready-checks, AFK rules, and anti-collusion signals so wins actually mean something.',
      bullets: [
        'Ready-check, turn timers, and lifecycle rules applied server-side.',
        'Identity-tied comms, report flows, and review queues for disputes.',
        'Fog-of-war, alliances, and capitals implemented as server rules, not client vibes.',
      ],
    },
    {
      title: 'Built for load',
      description:
        'Real-time sockets and CDN assets keep the map snappy even when twelve egos pile in at once.',
      bullets: [
        'Delta streaming for state; no “full refresh” nonsense mid-siege.',
        'Optimized map tiles and assets; cache-busted, CDN-served.',
        'Scales to 12 commanders per battlefield without stalling animations.',
      ],
    },
    {
      title: 'Comforts for commanders',
      description: 'Play into the wee hours without frying your retinas or your friendships.',
      bullets: [
        'Push notifications, turn pings, and ready-check reminders.',
        'Theme presets, audio cues, and contrast-friendly overlays.',
        'Chat, clans, and moderation tools tied to verified accounts.',
      ],
    },
  ]

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
              Conquest
            </span>
          </h1>

          {/* Tighter Value Proposition */}
          <p className="mt-3 mx-auto max-w-[52ch] text-white/80 text-center text-lg md:text-xl">
            Rewrite borders. ConquestK notarizes every triumphant march and embarrassing retreat.
          </p>

          {/* Clearer Primary Action */}
          <div className="mt-7 flex items-center justify-center gap-3">
            {isAuthenticated ? (
              <>
                <Link to="/lobby" className="btn-primary btn-lg">
                  ⚡ Launch Campaign →
                </Link>
                <Link to="/map-editor" className="btn-secondary btn-lg">
                  Forge a Map
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className="btn-primary btn-lg">
                  Plot Your Coup →
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
              // Try CDN/asset path first, then fall back to a bundled public image
              backgroundImage: `url('${heroBackground}'), url('/og.png')`,
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
                  CONQUER OR BE CONQUERED
                </span>
              </h2>
              <p className="text-xl text-muted max-w-2xl mx-auto">
                Deploy armies • Capture Territories • Conquer your opposition
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
              <span className="text-white">Campaign toolkit</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="panel group min-h-[96px] p-5 hover:-translate-y-0.5 transition will-change-transform"
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
              <span className="text-white">Choose your theatre</span>
            </h2>
            <p className="text-muted text-sm">
              Climb the Conquest Ladder, play a casual game, or start a clan war—we have a lobby
              staged for every flavor of ambition.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {gameExperiences.map((experience) => (
              <div
                key={experience.title}
                className="panel p-5 flex flex-col gap-4"
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
              <span className="text-white">Why conquerors linger</span>
            </h2>
            <p className="text-muted text-sm">
              Built for rulers who crave strategy, tools, and options.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {highlights.map((highlight) => (
              <div
                key={highlight.title}
                className="panel p-5 text-left"
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

      {/* How It Works - Streamlined */}
      <section className="relative z-10 section-spacing-sm">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              <span className="text-white">How to seize the map</span>
            </h2>
            <p className="text-muted text-sm">
              Memorize these three pillars before you start renaming continents after yourself.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="panel p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                1
              </div>
              <h3 className="text-lg font-medium text-heading mb-2">Stack the capital</h3>
              <p className="text-muted text-sm">
                Fortify strongholds, guard borders, and leave just enough bait to lure overeager
                liberators.
              </p>
            </div>
            <div className="panel p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                2
              </div>
              <h3 className="text-lg font-medium text-heading mb-2">Bully the odds</h3>
              <p className="text-muted text-sm">
                Blitz when the dice favor you, turtle when they don’t, and rotate fronts before the
                neighbors smell weakness.
              </p>
            </div>
            <div className="panel p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                3
              </div>
              <h3 className="text-lg font-medium text-heading mb-2">Publish the victory</h3>
              <p className="text-muted text-sm">
                Cash in treasures, claim domination, and rise to glory.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 section-spacing">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="panel p-8 md:p-12 text-center">
            <h2 className="text-3xl font-bold text-white">
              High command is asking: whose banner flies tonight?
            </h2>
            <p className="mt-4 text-white/80 text-base md:text-lg">
              The beta is online. Rally your council, draft a fresh map, or queue solo and walk away
              with new provinces.
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
                    Start your Conquest →
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
