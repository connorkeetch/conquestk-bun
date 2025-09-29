import {
  BookOpen,
  Gamepad2,
  Map as MapIcon,
  Settings,
  Shield,
  Trophy,
  Users,
  Zap,
} from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { RANK_COLORS } from '../constants/colors'
import { FEATURE_FLAGS } from '../constants/featureFlags'
import { useFeatureFlag } from '../hooks/useFeatureFlag'

const TutorialPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'basics' | 'gametypes' | 'strategy' | 'rankings' | 'editor' | 'options'
  >('basics')
  const comingSoonUiEnabled = useFeatureFlag(FEATURE_FLAGS.COMING_SOON_UI)

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[color:var(--color-primary)] mb-2">How to Play</h1>
        <p className="text-muted text-lg">
          Master the art of conquest with our comprehensive guides
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs mb-8">
        <button
          type="button"
          onClick={() => setActiveTab('basics')}
          className={`tab ${activeTab === 'basics' ? 'tab-active' : ''}`}
        >
          <BookOpen className="w-4 h-4" />
          Basics
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('gametypes')}
          className={`tab ${activeTab === 'gametypes' ? 'tab-active' : ''}`}
        >
          <Gamepad2 className="w-4 h-4" />
          Game Types
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('strategy')}
          className={`tab ${activeTab === 'strategy' ? 'tab-active' : ''}`}
        >
          <Shield className="w-4 h-4" />
          Strategy
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rankings')}
          className={`tab ${activeTab === 'rankings' ? 'tab-active' : ''}`}
        >
          <Trophy className="w-4 h-4" />
          Rankings & CP
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('editor')}
          className={`tab ${activeTab === 'editor' ? 'tab-active' : ''}`}
        >
          <MapIcon className="w-4 h-4" />
          Map Editor
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('options')}
          className={`tab ${activeTab === 'options' ? 'tab-active' : ''}`}
        >
          <Settings className="w-4 h-4" />
          Game Options
        </button>
      </div>

      {/* Content Area */}
      <div className="panel min-h-[500px]">
        {activeTab === 'basics' && (
          <div className="space-y-8">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">
                Getting started
              </h2>
              <p className="text-sm text-muted max-w-2xl">
                Understand the win condition, the three-part turn loop, and the controls you&apos;ll
                use in every match.
              </p>
            </header>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">Objective</h3>
              <p className="text-muted text-sm">
                Conquer territories, build armies, and eliminate all opponents to achieve global
                domination.
              </p>
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                  Turn phases
                </h3>
                <p className="text-xs text-muted sm:text-sm max-w-xl">
                  Each turn flows through three steps. Use them together to build momentum and
                  secure the front lines.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="panel-muted border-l-4 border-[color:var(--color-warning)]">
                  <h4 className="font-semibold text-[color:var(--color-warning)]">1. Reinforce</h4>
                  <p className="text-sm text-muted mt-2">
                    Deploy new troops to friendly territory. Bonus soldiers arrive when you hold
                    entire sectors, and in team games you can reinforce an ally directly.
                  </p>
                </div>
                <div className="panel-muted border-l-4 border-[color:var(--color-danger)]">
                  <h4 className="font-semibold text-[color:var(--color-danger)]">2. Attack</h4>
                  <p className="text-sm text-muted mt-2">
                    Strike adjacent enemies. Dice rolls resolve battles, and you can chain attacks
                    until you stop or run out of units.
                  </p>
                </div>
                <div className="panel-muted border-l-4 border-[color:var(--color-success)]">
                  <h4 className="font-semibold text-[color:var(--color-success)]">3. Fortify</h4>
                  <p className="text-sm text-muted mt-2">
                    Shift troops between connected territories to cover weak borders before the next
                    player moves.
                  </p>
                </div>
              </div>
            </section>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Basic controls
              </h3>
              <ul className="text-sm text-muted space-y-2">
                <li>Click friendly territories (or a teammate&apos;s) to place reinforcements</li>
                <li>Drag from your territory to an enemy territory to attack</li>
                <li>Scroll or pinch to zoom the map, and drag to pan</li>
                <li>Use right-click (or long press) to cancel the current action</li>
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'gametypes' && (
          <div className="space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">Game types</h2>
              <p className="text-sm text-muted max-w-2xl">
                Mix up the rules to keep matches fresh. These presets are available in matchmaking
                and private lobbies.
              </p>
            </header>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="panel-muted space-y-2 border-t-4 border-[color:var(--color-success)]">
                <h3 className="text-lg font-semibold text-[color:var(--color-success)]">Classic</h3>
                <p className="text-sm text-muted">
                  The standard ConquestK experience—start with shared territory, push opponents off
                  the board, and rule the map.
                </p>
              </div>
              <div className="panel-muted space-y-2 border-t-4 border-[color:var(--color-primary)]">
                <h3 className="text-lg font-semibold text-[color:var(--color-primary)]">
                  Capitals
                </h3>
                <p className="text-sm text-muted">
                  Each player defends a capital. Eliminating every rival still wins the war, but
                  holding capitals creates strategic pressure.
                </p>
              </div>
              <div className="panel-muted space-y-2 border-t-4 border-[color:var(--color-info)]">
                <h3 className="text-lg font-semibold text-[color:var(--color-info)]">
                  Random mode
                </h3>
                <p className="text-sm text-muted">
                  Shake up treasure payouts, timers, fog, and more with a single click. Perfect for
                  groups who want every match to feel different.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'strategy' && (
          <div className="space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">Strategic tips</h2>
              <p className="text-sm text-muted max-w-2xl">
                Positioning, timing, and resource management win campaigns. These fundamentals help
                at every stage of the match.
              </p>
            </header>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="panel-muted space-y-3">
                <h3 className="text-lg font-semibold text-[color:var(--color-primary)]">
                  Early game
                </h3>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <Zap className="h-4 w-4 text-[color:var(--color-warning)] mt-0.5" />
                    <span>Secure an easily defended sector to earn bonus reinforcements.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-4 w-4 text-[color:var(--color-warning)] mt-0.5" />
                    <span>
                      Favor regions with fewer borders (Australia, South America) early on.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-4 w-4 text-[color:var(--color-warning)] mt-0.5" />
                    <span>
                      Consolidate strength before expanding—spread troops too thin and you invite
                      counterattacks.
                    </span>
                  </li>
                </ul>
              </div>
              <div className="panel-muted space-y-3">
                <h3 className="text-lg font-semibold text-[color:var(--color-primary)]">
                  Mid game
                </h3>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-[color:var(--color-success)] mt-0.5" />
                    <span>Break enemy sectors to choke off their bonus troops.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-[color:var(--color-success)] mt-0.5" />
                    <span>Keep border territories stocked with at least 3–5 extra units.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-[color:var(--color-success)] mt-0.5" />
                    <span>
                      Coordinate temporary alliances to check runaway leaders—but remember
                      there&apos;s only one victor.
                    </span>
                  </li>
                </ul>
              </div>
              <div className="panel-muted space-y-3">
                <h3 className="text-lg font-semibold text-[color:var(--color-primary)]">
                  Late game
                </h3>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <Trophy className="h-4 w-4 text-[color:var(--color-info)] mt-0.5" />
                    <span>Time your card cash-ins to fuel decisive strikes.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Trophy className="h-4 w-4 text-[color:var(--color-info)] mt-0.5" />
                    <span>Eliminate weakened opponents quickly to capture their cards.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Trophy className="h-4 w-4 text-[color:var(--color-info)] mt-0.5" />
                    <span>Maintain a strong defensive line while pushing key objectives.</span>
                  </li>
                </ul>
              </div>
            </div>

            <section className="panel-muted space-y-2">
              <h3 className="text-lg font-semibold text-[color:var(--color-danger)]">
                Combat odds at a glance
              </h3>
              <ul className="text-sm text-muted space-y-1">
                <li>Attackers roll up to 3 dice; defenders roll up to 2.</li>
                <li>Higher dice win ties in favor of the defender.</li>
                <li>Aim for at least a 3:2 troop ratio when launching major assaults.</li>
                <li>
                  Never leave a captured territory with a single troop—keep reserves in place.
                </li>
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'rankings' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-[color:var(--heading)]">
              The Conqueror's Path – ranking system
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                  How Conquest Points (CP) work
                </h3>
                <p className="text-muted">
                  Conquest Points (CP) measure your skill based on game results. Everyone starts at
                  1000 CP. Win against higher-rated players to gain more points, lose to lower-rated
                  players to lose more points. Your journey follows the path of history's greatest
                  conquerors!
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                  The Conqueror&apos;s path
                </h3>
                <div className="space-y-3">
                  <div className="panel-muted flex items-center gap-3">
                    <span className="text-2xl">🛡️</span>
                    <div>
                      <div className="font-semibold" style={{ color: RANK_COLORS.CHIEFTAIN.base }}>
                        Chieftain (0-599)
                      </div>
                      <div className="text-sm text-muted">
                        Leads a tribe or small clan, fighting for survival — Example: Vercingetorix
                      </div>
                    </div>
                  </div>

                  <div className="panel-muted flex items-center gap-3">
                    <span className="text-2xl">⚔️</span>
                    <div>
                      <div className="font-semibold" style={{ color: RANK_COLORS.WARLORD.base }}>
                        Warlord (600-799)
                      </div>
                      <div className="text-sm text-muted">
                        Rules by might, feared by neighboring villages — Example: Shaka Zulu
                      </div>
                    </div>
                  </div>

                  <div className="panel-muted flex items-center gap-3">
                    <span className="text-2xl">⚓</span>
                    <div>
                      <div
                        className="font-semibold"
                        style={{ color: RANK_COLORS.RAIDER_KING.base }}
                      >
                        Raider King (800-999)
                      </div>
                      <div className="text-sm text-muted">
                        Expands by plunder and coastal terror — Example: Ragnar Lothbrok
                      </div>
                    </div>
                  </div>

                  <div className="panel-muted flex items-center gap-3">
                    <span className="text-2xl">☪️</span>
                    <div>
                      <div className="font-semibold" style={{ color: RANK_COLORS.SULTAN.base }}>
                        Sultan (1000-1199)
                      </div>
                      <div className="text-sm text-muted">
                        Wields faith and politics alongside armies — Example: Saladin
                      </div>
                    </div>
                  </div>

                  <div className="panel-muted flex items-center gap-3">
                    <span className="text-2xl">🦅</span>
                    <div>
                      <div className="font-semibold" style={{ color: RANK_COLORS.CAESAR.base }}>
                        Caesar (1200-1399)
                      </div>
                      <div className="text-sm text-muted">
                        Transforms republic into empire — Example: Julius Caesar
                      </div>
                    </div>
                  </div>

                  <div className="panel-muted flex items-center gap-3">
                    <span className="text-2xl">🏹</span>
                    <div>
                      <div className="font-semibold" style={{ color: RANK_COLORS.KHAN.base }}>
                        Khan (1400-1599)
                      </div>
                      <div className="text-sm text-muted">
                        Masters of cavalry and mobility — Example: Genghis Khan
                      </div>
                    </div>
                  </div>

                  <div className="panel-muted flex items-center gap-3">
                    <span className="text-2xl">👑</span>
                    <div>
                      <div className="font-semibold" style={{ color: RANK_COLORS.EMPEROR.base }}>
                        Emperor (1600-1799)
                      </div>
                      <div className="text-sm text-muted">
                        Commands massive armies — Example: Napoleon Bonaparte
                      </div>
                    </div>
                  </div>

                  <div className="panel-muted flex items-center gap-3">
                    <span className="text-2xl">☀️</span>
                    <div>
                      <div className="font-semibold" style={{ color: RANK_COLORS.GREAT_KING.base }}>
                        The Great King (1800-1999)
                      </div>
                      <div className="text-sm text-muted">
                        Ruler of kings, empire spanning sectors — Example: Alexander the Great
                      </div>
                    </div>
                  </div>

                  <div className="panel-muted flex items-center gap-3">
                    <span className="text-2xl">💀</span>
                    <div>
                      <div
                        className="font-semibold"
                        style={{
                          color: RANK_COLORS.OVERLORD.base,
                          textShadow: '0 0 8px rgba(255, 255, 255, 0.8)',
                        }}
                      >
                        Overlord (2000-2199)
                      </div>
                      <div className="text-sm text-muted">
                        Tyrant who demands tribute and burns resistance — Example: Attila the Hun
                      </div>
                    </div>
                  </div>

                  <div className="panel-muted flex items-center gap-3">
                    <span className="text-2xl">☄️</span>
                    <div>
                      <div
                        className="font-semibold"
                        style={{
                          background: RANK_COLORS.APOCALYPSE.base,
                          backgroundClip: 'text',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}
                      >
                        Worldbreaker (2200+)
                      </div>
                      <div className="text-sm text-muted">
                        Apocalyptic conqueror, remembered for brutality — Example: Tamerlane
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel-muted space-y-2">
                <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                  Earning Conquest Points
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  <li>Win games to grow your CP</li>
                  <li>Eliminations and decisive victories award bonus points</li>
                  <li>Ranked games adjust CP; casual matches are risk-free practice</li>
                  <li>Consistency matters—stringing wins together accelerates progress</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'editor' && (
          <div className="space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">
                Map editor guide
              </h2>
              <p className="text-sm text-muted max-w-2xl">
                Create custom battlefields with the token-based editor and share them with the
                community.
              </p>
            </header>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Quick start steps
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted">
                <li>Upload a background image (minimum 400×300)</li>
                <li>Place territory tokens on strategic locations</li>
                <li>Assign sectors and bonuses as needed</li>
                <li>Connect territories to define borders</li>
                <li>Set capital positions for each player count</li>
                <li>Save your map and submit it for approval</li>
              </ol>
            </section>

            <section className="space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Editor modes
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-success)]">
                    🗺️ Territories mode
                  </h4>
                  <p className="text-sm text-muted">
                    Place and reposition territory tokens. Select a sector first to auto-assign new
                    territories.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-primary)]">
                    🌍 Sectors mode
                  </h4>
                  <p className="text-sm text-muted">
                    Group territories into sectors, set bonus values, and choose highlight colors.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-info)]">
                    🔗 Connections mode
                  </h4>
                  <p className="text-sm text-muted">
                    Select a territory, then click neighbours to establish attack paths and
                    adjacency.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-warning)]">
                    👑 Capitals mode
                  </h4>
                  <p className="text-sm text-muted">
                    Auto-generate or hand-pick balanced starting positions for 2–12 players.
                  </p>
                </div>
              </div>
            </section>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Capital assignment system
              </h3>
              <p className="text-sm text-muted">
                Balanced starting locations keep every match fair:
              </p>
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-success)]">✨</span>
                  <span>
                    <strong>Auto-generation:</strong> Maximises distance between capitals using a
                    maximin algorithm.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-primary)]">🎯</span>
                  <span>
                    <strong>Manual override:</strong> Click territories in Capitals mode to
                    customise placements.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-info)]">👥</span>
                  <span>
                    <strong>Player-specific sets:</strong> Generates optimal layouts for every
                    supported player count.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-warning)]">⚖️</span>
                  <span>
                    <strong>Fair play:</strong> Prevents unfair clustering or unreachable capitals.
                  </span>
                </li>
              </ul>
            </section>

            <section className="panel space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Map requirements
              </h3>
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th className="text-center">Minimum</th>
                    <th className="text-center">Recommended</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Territories</td>
                    <td className="text-center text-[color:var(--color-warning)]">2</td>
                    <td className="text-center text-[color:var(--color-success)]">20–50</td>
                  </tr>
                  <tr>
                    <td>Sectors</td>
                    <td className="text-center text-[color:var(--color-warning)]">Optional</td>
                    <td className="text-center text-[color:var(--color-success)]">3–7</td>
                  </tr>
                  <tr>
                    <td>Image size</td>
                    <td className="text-center text-[color:var(--color-warning)]">400×300</td>
                    <td className="text-center text-[color:var(--color-success)]">1200×800</td>
                  </tr>
                  <tr>
                    <td>File size</td>
                    <td className="text-center text-[color:var(--color-warning)]">&lt; 10 MB</td>
                    <td className="text-center text-[color:var(--color-success)]">&lt; 2 MB</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Getting maps approved
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted">
                <li>
                  <strong>Validation:</strong> Automatic checks confirm minimum requirements.
                </li>
                <li>
                  <strong>Playability:</strong> All territories must be connected.
                </li>
                <li>
                  <strong>Balance:</strong> Distribute territories and bonuses evenly.
                </li>
                <li>
                  <strong>Quality:</strong> Ensure clear visuals and theme consistency.
                </li>
                <li>
                  <strong>Community review:</strong> Gather feedback from playtesters.
                </li>
                <li>
                  <strong>Admin approval:</strong> Final verification before publication.
                </li>
              </ol>
              <p className="text-sm text-muted">
                💡 Tip: Well-balanced maps with interesting themes move through review faster.
              </p>
            </section>

            <section className="panel-muted space-y-2">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Advanced features
              </h3>
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-info)]">📏</span>
                  <span>
                    <strong>Grid snap:</strong> Toggle grid snapping for precise placement.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-primary)]">🔄</span>
                  <span>
                    <strong>Import/export:</strong> Save maps as JSON for backup or collaboration.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-success)]">🎨</span>
                  <span>
                    <strong>Token shapes:</strong> Choose hexagon, square, or circle tokens.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-warning)]">🔍</span>
                  <span>
                    <strong>Image scaling:</strong> Adjust the background between 50% and 150%.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-danger)]">✂️</span>
                  <span>
                    <strong>Smart cropping:</strong> Trim images to the ideal dimensions.
                  </span>
                </li>
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'options' && (
          <div className="space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">Game options</h2>
              <p className="text-sm text-muted max-w-2xl">
                Dial in lobby rules to match your group&apos;s pace, playstyle, and competitive
                level.
              </p>
            </header>

            <section className="space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Game settings
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-warning)]">
                    Turn time limit
                  </h4>
                  <p className="text-sm text-muted">
                    Async games default to 24 hours (customisable from 30 minutes up to 72 hours).
                    Real-time games use shorter limits for fast-paced play.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-success)]">Players</h4>
                  <p className="text-sm text-muted">
                    Support for 2–12 commanders. Enable the <em>Random</em> slot to let any player
                    fill remaining seats.
                  </p>
                </div>
                <div className="panel-muted space-y-2">
                  <h4 className="font-semibold text-[color:var(--color-primary)]">
                    Hidden Treasures
                  </h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    <li>
                      <strong>Progressive:</strong> 4, 6, 9, 13, 18, … increasing payouts per set.
                    </li>
                    <li>
                      <strong>Classic:</strong> 4, 6, 8, 10, 12, 15, 20, 25, 30, 35, then +5.
                    </li>
                    <li>
                      <strong>Fixed:</strong> A steady value per set (host selects the value).
                    </li>
                    <li>
                      <strong>Disabled:</strong> Sets redeem for 0 troops.
                    </li>
                  </ul>
                  <p className="text-xs text-muted">
                    Diamond chance is fixed at 8%. Hand limit is 5; sets with a diamond get +3.
                  </p>
                </div>
                <div className="panel-muted space-y-2">
                  <h4 className="font-semibold text-[color:var(--color-info)]">Fortification</h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    <li>
                      <strong>Adjacent:</strong> One move to a connected territory.
                    </li>
                    <li>
                      <strong>Adjacent multi:</strong> Multiple moves across adjacent spaces.
                    </li>
                    <li>
                      <strong>Chained:</strong> One move along your contiguous territory chain.
                    </li>
                    <li>
                      <strong>Unlimited:</strong> Reposition freely along owned chains.
                    </li>
                  </ul>
                </div>
                <div className="panel-muted space-y-2">
                  <h4 className="font-semibold text-[color:var(--color-primary)]">Fog of war</h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    <li>
                      <strong>Off:</strong> Everyone sees the entire map.
                    </li>
                    <li>
                      <strong>Adjacent:</strong> Vision extends only to neighbouring territories.
                    </li>
                    <li>
                      <strong>Persistent:</strong> Previously scouted territories stay revealed.
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Room options
              </h3>
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <Users className="h-5 w-5 text-[color:var(--color-primary)] mt-0.5" />
                  <span>
                    <strong>Player count:</strong> Choose the roster size for the lobby.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="h-5 w-5 text-[color:var(--color-primary)] mt-0.5" />
                  <span>
                    <strong>Visibility:</strong> Set the match to Public, Private (invite code)
                    {comingSoonUiEnabled ? ' or Tournament' : ''}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="h-5 w-5 text-[color:var(--color-primary)] mt-0.5" />
                  <span>
                    <strong>Teams:</strong> Enable balanced teams or stick with free-for-all.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="h-5 w-5 text-[color:var(--color-primary)] mt-0.5" />
                  <span>
                    <strong>Game type:</strong> Casual matches for practice or Ranked for CP stakes.
                  </span>
                </li>
              </ul>
            </section>

            <section className="panel-muted space-y-2">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Advanced options
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>
                  <strong>Territory modifiers:</strong> Sparse, Balanced, or Abundant bonus layouts.
                </li>
                <li>
                  <strong>Game speed:</strong> Real-time (synchronous) or Async (take turns over
                  hours).
                </li>
                <li>
                  <strong>Auto-naming:</strong> Generate descriptive lobby names from settings.
                </li>
                <li>
                  <strong>Color selection:</strong> Pick from standard or premium player palettes.
                </li>
                <li>
                  <strong>Map selection:</strong> Classic world, community creations, or random
                  choice.
                </li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default TutorialPage
