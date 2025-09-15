import type React from 'react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'

interface Feature {
  icon: string
  title: string
  description: string
  status: 'available' | 'coming-soon'
}

const Home: React.FC = () => {
  const { isAuthenticated } = useAppSelector((state) => state.auth)

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
    {
      icon: '🏆',
      title: 'Tournaments',
      description: 'Ranked seasons and competitive events',
      status: 'coming-soon',
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
                <Link
                  to="/lobby"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl
                           bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-semibold
                           shadow-[0_10px_30px_-10px_rgba(56,189,248,.6)]
                           hover:shadow-[0_18px_48px_-12px_rgba(99,102,241,.7)]
                           active:scale-[.98] transition
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  ⚡ Start Playing →
                </Link>
                <Link
                  to="/map-editor"
                  className="px-5 py-3 rounded-xl border border-white/15 text-white/80 hover:text-white hover:bg-white/5 transition"
                >
                  Map Editor
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl
                           bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-semibold
                           shadow-[0_10px_30px_-10px_rgba(56,189,248,.6)]
                           hover:shadow-[0_18px_48px_-12px_rgba(99,102,241,.7)]
                           active:scale-[.98] transition
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  Join the War →
                </Link>
                <Link
                  to="/login"
                  className="px-5 py-3 rounded-xl border border-white/15 text-white/80 hover:text-white hover:bg-white/5 transition"
                >
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
              backgroundImage: `url('/world-map-hero.jpg')`,
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
            {features.map((feature, index) => (
              <div
                key={index}
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
    </div>
  )
}

export default Home
