import type React from 'react'
import { Link } from 'react-router-dom'
import { resolveAssetPath } from '@/utils/assets'
import { useAppSelector } from '../hooks/redux'

const Home: React.FC = () => {
  const { isAuthenticated } = useAppSelector((state) => state.auth)

  const heroBackground = resolveAssetPath('static/images/world-map-hero.jpg')

  interface Offering {
    icon: string
    title: string
    blurb: string
    badges?: string[] // short meta tags (optional)
    status?: 'available' | 'coming-soon'
  }

  const offerings: Offering[] = [
    {
      icon: '🎮',
      title: 'Game Modes',
      blurb: 'Domination, Capitals, King of the Hill, and Assassination — play FFA or teams.',
      badges: ['Domination', 'Capitals', 'KOTH', 'Assassination'],
    },
    {
      icon: '👥',
      title: 'Players & Teams',
      blurb: 'Up to 12 players with up to 6 teams. Queue FFA or coordinate in squads.',
      badges: ['12 players', 'Up to 6 teams', 'FFA/Teams'],
    },
    {
      icon: '⏱️',
      title: 'Live & 24h Turns',
      blurb: 'Run live sessions or asynchronous 24‑hour turns with ready‑checks and AFK rules.',
      badges: ['Live', '24h', 'Ready‑check'],
    },
    {
      icon: '💎',
      title: 'Hidden Treasures',
      blurb: 'Redeem sets of 3 (bronze/silver/gold/diamond) for reinforcements.',
      badges: ['Sets of 3', 'Diamond bonus'],
    },
    {
      icon: '🌫️',
      title: 'Fog of War',
      blurb: 'Choose Open or Fog — you can only target what you can see.',
      badges: ['Open', 'Fog'],
    },
    {
      icon: '🤖',
      title: 'AI Commanders',
      blurb: 'Commander & Grandmaster tiers that respect team rules and play fast, fair turns.',
      badges: ['Commander', 'Grandmaster', 'Fill seats'],
    },
    {
      icon: '🎨',
      title: 'Customization',
      blurb:
        '16 player colors (12 standard + 4 premium) and premium themes with animated backdrops.',
      badges: ['16 colors', 'Premium themes'],
    },
    {
      icon: '🎬',
      title: 'Replays & Receipts',
      blurb: 'Timeline, turn diffs, dice logs, and fortify paths — no guesswork.',
      badges: ['Timeline', 'Turn diffs', 'Dice logs'],
    },
    {
      icon: '🗺️',
      title: 'Map Editor',
      blurb: 'Build sectors, adjacencies, and capitals; submit for review, then publish.',
      badges: ['Draft → Review → Publish'],
    },
    {
      icon: '🏆',
      title: 'Ranks & Clans',
      blurb: 'Conquest Points (Elo‑inspired) ranking, seasonal ladders, and clan campaigns.',
      badges: ['CP ranking', 'Ladders', 'Clans'],
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
                  Wage War →
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

      {/* Systems & Modes (combined) */}
      <section className="relative z-10 section-spacing-sm">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold">
              <span className="text-white">Systems & Modes</span>
            </h2>
            <p className="text-muted text-sm">The parts that matter on game night. No fluff.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {offerings.map((item) => (
              <div key={item.title} className="panel p-5 group hover:-translate-y-0.5 transition">
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">{item.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-medium">{item.title}</h3>
                      {item.status === 'coming-soon' && (
                        <span className="ml-auto text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-white/70">{item.blurb}</p>

                    {item.badges && item.badges.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.badges.map((b) => (
                          <span
                            key={`${item.title}-${b}`}
                            className="text-[10px] uppercase tracking-wide text-muted bg-surface-1/50 border border-border px-2 py-0.5 rounded-full"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
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
              <h3 className="text-lg font-medium text-heading mb-2">Deploy reinforcements</h3>
              <p className="text-muted text-sm">
                Place troops to secure borders and set up your push.
              </p>
            </div>
            <div className="panel p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                2
              </div>
              <h3 className="text-lg font-medium text-heading mb-2">Attack and adapt</h3>
              <p className="text-muted text-sm">
                Roll the attacks, pivot fronts, and seize bonuses.
              </p>
            </div>
            <div className="panel p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                3
              </div>
              <h3 className="text-lg font-medium text-heading mb-2">Fortify the line</h3>
              <p className="text-muted text-sm">
                Reposition armies to lock borders and hold gains.
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
              Whose banner will fly over the battlefield?
            </h2>
            <p className="mt-4 text-white/80 text-base md:text-lg">
              The beta is online. Rally your troops and conquer the map.
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
