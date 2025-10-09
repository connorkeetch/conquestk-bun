import { BookOpen, Gamepad2, Map as MapIcon, Settings, Shield, Trophy, Zap } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { RANK_COLORS } from '../constants/colors'

const formatRankRange = (min: number, max: number) => {
  if (!Number.isFinite(max)) {
    return `${min}+`
  }
  return `${min}-${max}`
}

const RANKING_TRACK = [
  {
    key: 'CHIEFTAIN',
    icon: '🛡️',
    label: 'Chieftain',
    description: 'Village champion with a well-loved spear and something to prove.',
    example: 'Vercingetorix',
  },
  {
    key: 'WARLORD',
    icon: '⚔️',
    label: 'Warlord',
    description: 'Regional bully who thinks diplomacy is a myth.',
    example: 'Shaka Zulu',
  },
  {
    key: 'RAIDER_KING',
    icon: '⚓',
    label: 'Raider King',
    description: 'Fleet-fueled menace raiding coasts before breakfast.',
    example: 'Ragnar Lothbrok',
  },
  {
    key: 'SULTAN',
    icon: '☪️',
    label: 'Sultan',
    description: 'Diplomat with an army, balancing silk routes and sieges.',
    example: 'Saladin',
  },
  {
    key: 'CAESAR',
    icon: '🦅',
    label: 'Caesar',
    description: 'Empire-builder rewriting the senate agenda.',
    example: 'Julius Caesar',
  },
  {
    key: 'KHAN',
    icon: '🏹',
    label: 'Khan',
    description: 'Lightning cavalry incarnate; moves faster than diplomacy.',
    example: 'Genghis Khan',
  },
  {
    key: 'EMPEROR',
    icon: '👑',
    label: 'Emperor',
    description: 'Commands legions across continents and still finds time for pageantry.',
    example: 'Napoleon Bonaparte',
  },
  {
    key: 'GREAT_KING',
    icon: '☀️',
    label: 'Great King',
    description: 'Ruler of rulers, basking in continent-wide adoration.',
    example: 'Alexander the Great',
  },
  {
    key: 'OVERLORD',
    icon: '💀',
    label: 'Overlord',
    description: 'Obsidian-crowned tyrant; taxes are payable in fear.',
    example: 'Attila the Hun',
  },
  {
    key: 'WORLDBREAKER',
    icon: '☄️',
    label: 'Worldbreaker',
    description: 'Walking extinction event and rumor mill legend.',
    example: 'Tamerlane',
  },
] as const satisfies readonly {
  key: keyof typeof RANK_COLORS
  icon: string
  label: string
  description: string
  example: string
}[]

const TutorialPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'basics' | 'gametypes' | 'strategy' | 'rankings' | 'editor' | 'options'
  >('basics')

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[color:var(--color-primary)] mb-2">How to Play</h1>
        <p className="text-muted text-lg">
          Welcome to boot camp, commander. Here&apos;s how to steamroll the map with style.
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
          Game Settings
        </button>
      </div>

      {/* Content Area */}
      <div className="panel min-h-[500px]">
        {activeTab === 'basics' && (
          <div className="space-y-8">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">
                Boot camp briefing
              </h2>
              <p className="text-sm text-muted max-w-2xl">
                ConquestK is a three-phase loop of deploying troops, blasting neighbors, and
                tightening borders. Learn the rhythm, press the shiny buttons, and the planet is
                yours.
              </p>
            </header>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Primary directive
              </h3>
              <p className="text-muted text-sm">
                Eliminate every rival commander or hit the special victory condition for your mode.
                The scoreboard bar up top tracks rounds, active player, and your glorious march to
                domination.
              </p>
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                  Turn phases (a.k.a. the war drum)
                </h3>
                <p className="text-xs text-muted sm:text-sm max-w-xl">
                  The phase chips in the action bar light up for each step. You only advance when
                  you hit the big <strong>End Phase</strong> button, so take your time lining up the
                  next conquest.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="panel-muted border-l-4 border-[color:var(--color-warning)] space-y-2">
                  <h4 className="font-semibold text-[color:var(--color-warning)]">1. Reinforce</h4>
                  <p className="text-sm text-muted">
                    Click your territory (or an ally&apos;s in team play) to drop troops. The
                    Reinforcements meter above the dice bar counts down every placement.
                  </p>
                  <ul className="space-y-1 text-xs text-muted">
                    <li>Hold entire sectors for bonus armies at the start of the turn.</li>
                    <li>
                      Mis-drop a troop? Hit <strong>↶ Undo</strong> in the action bar to rewind the
                      last placement.
                    </li>
                    <li>
                      When the meter hits zero, the <strong>End Phase → Attack</strong> button
                      lights up. Smash it with gusto.
                    </li>
                  </ul>
                </div>
                <div className="panel-muted border-l-4 border-[color:var(--color-danger)] space-y-2">
                  <h4 className="font-semibold text-[color:var(--color-danger)]">2. Attack</h4>
                  <p className="text-sm text-muted">
                    Select an owned territory with at least two armies, then click an adjacent enemy
                    province to roll dice until someone blinks.
                  </p>
                  <ul className="space-y-1 text-xs text-muted">
                    <li>
                      Chain assaults as long as you have troops; every victory lets you march in.
                    </li>
                    <li>
                      Haven&apos;t actually attacked yet? You&apos;ll see{' '}
                      <strong>↩ Reinforce</strong> so you can hop back and redeploy.
                    </li>
                    <li>
                      Ready to dig in? Hit <strong>End Phase → Fortify</strong> to prep your
                      borders.
                    </li>
                  </ul>
                </div>
                <div className="panel-muted border-l-4 border-[color:var(--color-success)] space-y-2">
                  <h4 className="font-semibold text-[color:var(--color-success)]">3. Fortify</h4>
                  <p className="text-sm text-muted">
                    Choose a territory with spare troops, then a connected friendly target to shift
                    bodies along the supply line.
                  </p>
                  <ul className="space-y-1 text-xs text-muted">
                    <li>The fortification style (Adjacent, Chained, etc.) dictates valid paths.</li>
                    <li>
                      Need a redo? <strong>↶ Undo</strong> rewinds the most recent transfer during
                      the phase.
                    </li>
                    <li>
                      Tap <strong>End Phase → End Turn</strong> to hand the battlefield to the next
                      hopeful tyrant.
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Command console
              </h3>
              <ul className="text-sm text-muted space-y-2">
                <li>
                  Left-click / tap to select, attack, and fortify. Right-click or press Esc to
                  cancel.
                </li>
                <li>Drag the map to pan. Scroll or pinch to zoom in on the carnage.</li>
                <li>
                  The dice bar shows battle results and remaining reinforcements so you know when to
                  push harder.
                </li>
                <li>
                  Turn timer and (optional) time bank sit next to the active player badge—don&apos;t
                  let them hit zero unless you crave deserter status.
                </li>
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'gametypes' && (
          <div className="space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">
                Pick your theatre
              </h2>
              <p className="text-sm text-muted max-w-2xl">
                Every mode is a different propaganda poster. Choose how you want to win, then brag
                in global chat like the heroic liberator you are.
              </p>
            </header>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="panel-muted space-y-2 border-t-4 border-[color:var(--color-success)]">
                <h3 className="text-lg font-semibold text-[color:var(--color-success)]">Classic</h3>
                <p className="text-sm text-muted">
                  Everyone starts scattered across the map. Grind every enemy piece off the board
                  and claim the planet as your commemorative snow globe.
                </p>
                <ul className="text-xs text-muted space-y-1">
                  <li>Win condition: Last army standing.</li>
                  <li>Territory count, cards, and bonuses match the standard ruleset.</li>
                  <li>Ideal for first drops and teaching rookies humility.</li>
                </ul>
              </div>
              <div className="panel-muted space-y-2 border-t-4 border-[color:var(--color-primary)]">
                <h3 className="text-lg font-semibold text-[color:var(--color-primary)]">
                  Capitals
                </h3>
                <p className="text-sm text-muted">
                  You get a capital to defend; lose it and you&apos;re vaporized even if other
                  troops survive. Protect yours, vaporize theirs, cackle loudly.
                </p>
                <ul className="text-xs text-muted space-y-1">
                  <li>Capital territories glow with a crown marker on the map.</li>
                  <li>Card bonuses and continent income still apply—capitalize on both.</li>
                  <li>Perfect for surgical strikes and dramatic comeback plays.</li>
                </ul>
              </div>
              <div className="panel-muted space-y-2 border-t-4 border-[color:var(--color-warning)]">
                <h3 className="text-lg font-semibold text-[color:var(--color-warning)]">
                  👑 King of the Hill
                </h3>
                <p className="text-sm text-muted">
                  Hold the featured territory through the entire round to scoop victory points.
                  First to the target (default 10) triggers fireworks and salty rivals.
                </p>
                <ul className="text-xs text-muted space-y-1">
                  <li>Neutral defenders garrison the hill at match start—bring explosives.</li>
                  <li>
                    If rotation is enabled, the future hill markers appear two turns out so you can
                    road-trip early.
                  </li>
                  <li>Scoreboard pings every time points are tallied at round end.</li>
                </ul>
              </div>
            </div>

            <div className="panel-muted space-y-4">
              <h3 className="text-xl font-semibold text-[color:var(--color-warning)]">
                Hill tactics dossier
              </h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-[color:var(--heading)] mb-2">
                    How scoring works
                  </h4>
                  <p className="text-sm text-muted">
                    Points are awarded after the last commander finishes their turn. Teams share a
                    single score, so defend as a squad or watch someone else raise the flag.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-[color:var(--heading)] mb-2">
                    Battlefield notes
                  </h4>
                  <ul className="text-sm text-muted space-y-2">
                    <li className="flex items-start gap-2">
                      <Shield className="h-4 w-4 text-[color:var(--color-warning)] mt-0.5" />
                      <span>
                        Hill rotations follow your lobby setting (static or every N rounds). The
                        preview ping appears on the map banner and in the objectives panel.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Shield className="h-4 w-4 text-[color:var(--color-warning)] mt-0.5" />
                      <span>
                        Holding the hill through a full global turn earns one point; lose it at any
                        point and the scoreboard shrugs.
                      </span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-[color:var(--heading)] mb-2">
                    Suggested war crimes*
                  </h4>
                  <ul className="text-sm text-muted space-y-2">
                    <li className="flex items-start gap-2">
                      <Zap className="h-4 w-4 text-[color:var(--color-success)] mt-0.5" />
                      <span>
                        Blitz early to grab an uncontested lead—every point denied is a tantrum
                        earned.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Zap className="h-4 w-4 text-[color:var(--color-success)] mt-0.5" />
                      <span>
                        Stack neighboring tiles so counter-attacks break on your meat shield instead
                        of the hill proper.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Zap className="h-4 w-4 text-[color:var(--color-success)] mt-0.5" />
                      <span>
                        Watch the victory ticker; if an enemy is one point away, dump every army
                        into denial plays.
                      </span>
                    </li>
                  </ul>
                  <p className="text-[10px] text-muted">*Legally speaking, just clever strategy.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="panel-muted space-y-2 border-t-4 border-[color:var(--color-info)]">
                <h3 className="text-lg font-semibold text-[color:var(--color-info)]">Randomizer</h3>
                <p className="text-sm text-muted">
                  Can&apos;t decide? Random mode picks Classic or Capitals at match start and keeps
                  opponents guessing about your true intentions.
                </p>
                <p className="text-xs text-muted">
                  Combine with Random fortification and Fog of War for absolute chaos energy.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'strategy' && (
          <div className="space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">
                War council intel
              </h2>
              <p className="text-sm text-muted max-w-2xl">
                You already have armies. Now orchestrate them like an over-caffeinated general.
                These tips keep the initiative firmly under your iron fist.
              </p>
            </header>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="panel-muted space-y-3">
                <h3 className="text-lg font-semibold text-[color:var(--color-primary)]">
                  Operation Opening Salvo
                </h3>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <Zap className="h-4 w-4 text-[color:var(--color-warning)] mt-0.5" />
                    <span>
                      Grab a continent with two or fewer choke points; bonus troops are your oxygen.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-4 w-4 text-[color:var(--color-warning)] mt-0.5" />
                    <span>
                      Don&apos;t split forces across the globe. Concentrate, punch, relocate later.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-4 w-4 text-[color:var(--color-warning)] mt-0.5" />
                    <span>
                      Keep at least one border stacked so neighbors think twice about probing.
                    </span>
                  </li>
                </ul>
              </div>
              <div className="panel-muted space-y-3">
                <h3 className="text-lg font-semibold text-[color:var(--color-primary)]">
                  Operation Midgame Maelstrom
                </h3>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-[color:var(--color-success)] mt-0.5" />
                    <span>
                      Break enemy continents even if you can&apos;t hold them. Denying income is
                      victory.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-[color:var(--color-success)] mt-0.5" />
                    <span>
                      Track card counts. Anyone at 4 cards is a walking ATM—plan to finish them the
                      moment they hit 5.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-[color:var(--color-success)] mt-0.5" />
                    <span>
                      Temporary alliances are fine. Just remember you&apos;re all future enemies.
                    </span>
                  </li>
                </ul>
              </div>
              <div className="panel-muted space-y-3">
                <h3 className="text-lg font-semibold text-[color:var(--color-primary)]">
                  Operation Endgame Encore
                </h3>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <Trophy className="h-4 w-4 text-[color:var(--color-info)] mt-0.5" />
                    <span>
                      Chain eliminations by cashing cards mid-turn; each conquest feeds the next
                      hit.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Trophy className="h-4 w-4 text-[color:var(--color-info)] mt-0.5" />
                    <span>
                      Leave blocking stacks that force opponents to waste armies before reaching
                      you.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Trophy className="h-4 w-4 text-[color:var(--color-info)] mt-0.5" />
                    <span>
                      Secure the win condition—capitals, hill points, total wipe—before gloating.
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <section className="panel-muted space-y-2">
              <h3 className="text-lg font-semibold text-[color:var(--color-danger)]">
                Combat math, but cooler
              </h3>
              <ul className="text-sm text-muted space-y-1">
                <li>
                  Attackers roll up to 3 dice; defenders roll up to 2. Ties love the defender.
                </li>
                <li>
                  Launch major assaults with at least a 3:2 troop ratio; 4:2 if you hate coin flips.
                </li>
                <li>
                  Leaving a captured territory at 1 unit is how rebellions happen. Drop a spare
                  guard before marching on.
                </li>
                <li>
                  Card cash-ins escalate—save them for knockouts or hill rushes, not random flexes.
                </li>
              </ul>
            </section>

            <section className="panel-muted space-y-2">
              <h3 className="text-lg font-semibold text-[color:var(--color-accent)]">
                Diplomacy & psychological warfare
              </h3>
              <ul className="text-sm text-muted space-y-1">
                <li>Use chat to coordinate—or to promise nothing and betray everything.</li>
                <li>
                  Ping the map to warn allies of weak spots; they can reinforce you during phase
                  one.
                </li>
                <li>
                  Track the timer. Running opponents out of time is a totally legitimate tactic.
                </li>
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'rankings' && (
          <div className="space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">
                Conquest Points & bragging rights
              </h2>
              <p className="text-sm text-muted max-w-2xl">
                Ranked play measures your ability to bully the galaxy with mathematics. Win games,
                climb tiers, unlock shinier borders, and make the leaderboard fear your name.
              </p>
            </header>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                How CP calculations behave
              </h3>
              <p className="text-sm text-muted">
                Everyone starts at <strong>800 CP</strong>. Beat higher-rated foes to scoop bonus
                points; lose to lower-rated players and the ledger hits harder. Eliminating an
                opponent in ranked grants extra credit on top of the win payout.
              </p>
              <p className="text-xs text-muted">
                Casual games are practice only—your CP bar won&apos;t budge there.
              </p>
            </section>

            <section className="panel-muted space-y-2">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Ranked lobby checklist
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>
                  Game must be <strong>Public</strong> with at least{' '}
                  <strong>3 human players</strong>.
                </li>
                <li>No teams and no AI commanders allowed—steel yourself for pure betrayal.</li>
                <li>
                  Turn timer + optional time bank still apply; don&apos;t surrender turns to the
                  void.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Badge progression
              </h3>
              <div className="space-y-3">
                {RANKING_TRACK.map((rank) => {
                  const palette = RANK_COLORS[rank.key]
                  const range = formatRankRange(palette.minElo, palette.maxElo)
                  const style =
                    rank.key === 'WORLDBREAKER'
                      ? {
                          background: palette.base,
                          backgroundClip: 'text',
                          WebkitBackgroundClip: 'text',
                          color: 'transparent',
                          WebkitTextFillColor: 'transparent',
                        }
                      : rank.key === 'OVERLORD'
                        ? { color: palette.base, textShadow: '0 0 8px rgba(255, 255, 255, 0.8)' }
                        : { color: palette.base }

                  return (
                    <div className="panel-muted flex items-center gap-3" key={rank.key}>
                      <span className="text-2xl" aria-hidden>
                        {rank.icon}
                      </span>
                      <div>
                        <div className="font-semibold" style={style}>
                          {rank.label} ({range})
                        </div>
                        <div className="text-sm text-muted">
                          {rank.description} — Example: {rank.example}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="panel-muted space-y-2">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                CP economy pro tips
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>
                  String wins together—streaks feed the algorithm more than isolated victories.
                </li>
                <li>
                  Finish eliminations yourself to steal their cards and bonus CP in one swoop.
                </li>
                <li>
                  Dodging high-ranked challengers protects CP, but beating them catapults you
                  upward.
                </li>
                <li>
                  Falling below 1000 doesn&apos;t exile you; it just means the comeback montage
                  starts now.
                </li>
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'editor' && (
          <div className="space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">
                Forge your own battlegrounds
              </h2>
              <p className="text-sm text-muted max-w-2xl">
                The map editor lets you sculpt continents, wire chokepoints, and subject friends to
                suspiciously self-serving geography.
              </p>
            </header>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Rapid deployment plan
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted">
                <li>Upload a backdrop (minimum 400×300)—bonus points for propaganda posters.</li>
                <li>Drop territory tokens wherever you want armies to brawl.</li>
                <li>Assign sectors and troop bonuses so the map actually pays rent.</li>
                <li>Connect neighbors to define who can punch whom.</li>
                <li>Lay out capitals for every player count from 2 up to 12.</li>
                <li>Hit save, run validations, and ship it for review.</li>
              </ol>
            </section>

            <section className="space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Editor modes
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-success)]">🗺️ Territories</h4>
                  <p className="text-sm text-muted">
                    Drag tokens, rename provinces, and set default army counts. Select a sector
                    first to auto-tag new territories.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-primary)]">🌍 Sectors</h4>
                  <p className="text-sm text-muted">
                    Group tiles into continents, pick highlight colors, and set reinforcement
                    bonuses.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-info)]">🔗 Connections</h4>
                  <p className="text-sm text-muted">
                    Select a territory, then click each neighbor to open or close attack routes.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-warning)]">👑 Capitals</h4>
                  <p className="text-sm text-muted">
                    Auto-generate balanced starting spots or hand-place them for ultimate narrative
                    control.
                  </p>
                </div>
              </div>
            </section>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Capital logic under the hood
              </h3>
              <p className="text-sm text-muted">
                We keep starting positions fair so nobody spawns in a cul-de-sac of doom:
              </p>
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-success)]">✨</span>
                  <span>
                    <strong>Auto-generation</strong> maximizes distance between capitals using a
                    maximin algorithm.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-primary)]">🎯</span>
                  <span>
                    <strong>Manual override</strong> lets you click exact spots if you have a
                    dramatic narrative in mind.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-info)]">👥</span>
                  <span>
                    <strong>Player-count presets</strong> produce layouts for every lobby size so
                    your map scales gracefully.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-warning)]">⚖️</span>
                  <span>
                    <strong>Fair-play guardrails</strong> stop you from stacking capitals in one
                    corner or on isolated islands.
                  </span>
                </li>
              </ul>
            </section>

            <section className="panel space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Publishing requirements
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
              <p className="text-xs text-muted">
                Keep assets crisp—blurry maps make commanders seasick.
              </p>
            </section>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Approval gauntlet
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted">
                <li>
                  <strong>Validation</strong> checks verify minimum counts and image sizing.
                </li>
                <li>
                  <strong>Connectivity</strong> review ensures every territory has a path to battle.
                </li>
                <li>
                  <strong>Balance pass</strong> confirms bonuses and chokepoints aren&apos;t absurd.
                </li>
                <li>
                  <strong>Style audit</strong> keeps labels legible and themes cohesive.
                </li>
                <li>
                  <strong>Community playtests</strong> gather salt levels and highlight exploits.
                </li>
                <li>
                  <strong>Admin approval</strong> stamps it into the public rotation.
                </li>
              </ol>
              <p className="text-sm text-muted">
                Tip: Attach a short lore blurb—reviewers love dramatic flavor text.
              </p>
            </section>

            <section className="panel-muted space-y-2">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Advanced toys
              </h3>
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-info)]">📏</span>
                  <span>
                    <strong>Grid snap</strong> keeps territories aligned for screenshot perfection.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-primary)]">🔄</span>
                  <span>
                    <strong>Import / export</strong> JSON backups for version control or
                    co-designers.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-success)]">🎨</span>
                  <span>
                    <strong>Token shapes</strong> swap circles, squares, or hexes depending on vibe.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-warning)]">🔍</span>
                  <span>
                    <strong>Image scaling</strong> ranges from 50% to 150% without degrading
                    clarity.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-danger)]">✂️</span>
                  <span>
                    <strong>Smart cropping</strong> trims edges so your final upload hits size
                    targets.
                  </span>
                </li>
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'options' && (
          <div className="space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-[color:var(--heading)]">
                Lobby configuration arsenal
              </h2>
              <p className="text-sm text-muted max-w-2xl">
                These toggles decide whether your match is a chill training mission or a screaming
                front-line campaign. Choose wisely; soldiers gossip about bad hosts.
              </p>
            </header>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Identity & access
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-success)]">Visibility</h4>
                  <p className="text-sm text-muted">
                    <strong>Public</strong> games appear in the lobby list. <strong>Private</strong>
                    games hide behind a shareable link; the invite code field is cosmetic for now so
                    copy the URL. Tournament slots piggyback on public visibility rules.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-primary)]">Game type</h4>
                  <p className="text-sm text-muted">
                    <strong>Casual</strong> ignores ranking. <strong>Ranked</strong> enforces the CP
                    checklist: public lobby, 3+ humans, no teams, and no AI generals.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-warning)]">Player slots</h4>
                  <p className="text-sm text-muted">
                    Supports 2–12 seats. Flag a slot as <em>Random</em> to let any applicant
                    auto-join as soon as the lobby opens.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-info)]">Teams</h4>
                  <p className="text-sm text-muted">
                    Toggle free-for-all or fixed teams. Valid team counts must evenly divide the max
                    players (e.g., 6 players → 2 or 3 teams). Ranked lobbies lock this off.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-danger)]">AI commanders</h4>
                  <p className="text-sm text-muted">
                    Add Recruit, Commander, or Grandmaster bots when the feature flag is active. AI
                    are banned in ranked games and respect the seat limit like any other player.
                  </p>
                </div>
              </div>
            </section>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Phase modifiers
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="panel-muted space-y-2">
                  <h4 className="font-semibold text-[color:var(--color-info)]">
                    Fortification styles
                  </h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    <li>
                      <strong>Adjacent:</strong> One move to a neighboring territory.
                    </li>
                    <li>
                      <strong>Adjacent Multi:</strong> Multiple single-step moves per fortify phase.
                    </li>
                    <li>
                      <strong>Chained:</strong> One move along any connected chain you control.
                    </li>
                    <li>
                      <strong>Unlimited:</strong> Shuffle across owned chains until satisfied.
                    </li>
                    <li>
                      <strong>Random:</strong> Lobby rolls one of the above at match start.
                    </li>
                  </ul>
                </div>
                <div className="panel-muted space-y-2">
                  <h4 className="font-semibold text-[color:var(--color-primary)]">Fog of war</h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    <li>
                      <strong>Off:</strong> Satellite intel for everyone, everywhere.
                    </li>
                    <li>
                      <strong>Adjacent:</strong> See only territories touching your own forces.
                    </li>
                    <li>
                      <strong>Persistent:</strong> Scouted tiles stay revealed even after you
                      retreat.
                    </li>
                  </ul>
                </div>
                <div className="panel-muted space-y-2">
                  <h4 className="font-semibold text-[color:var(--color-success)]">
                    Hidden Treasures
                  </h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    <li>
                      <strong>Classic:</strong> 4, 6, 8, 10, 12, 15, 20, 25, 30, 35, then +5
                      forever.
                    </li>
                    <li>
                      <strong>Progressive:</strong> 4, 6, 9, 13, 18, 24... escalating payouts.
                    </li>
                    <li>
                      <strong>Fixed:</strong> Same value every time—host chooses the troop award.
                    </li>
                    <li>
                      <strong>Disabled:</strong> Keep the cards for decoration only.
                    </li>
                  </ul>
                  <p className="text-xs text-muted">
                    Diamond drop rate: 8%. Hand limit: 5 cards. Diamond sets add +3 troops
                    automatically.
                  </p>
                </div>
                <div className="panel-muted space-y-2">
                  <h4 className="font-semibold text-[color:var(--color-warning)]">
                    Timers & banks
                  </h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    <li>
                      <strong>Turn timer:</strong> 10 seconds up to 24 hours. Default async rooms
                      start at 24h.
                    </li>
                    <li>
                      <strong>Time bank:</strong> Optional shared reserve matching the timer value,
                      spent in 30-second chunks.
                    </li>
                    <li>
                      <strong>Grace:</strong> When the timer hits zero and your bank is dry, the
                      game autopasses your turn.
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="panel-muted space-y-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-primary)]">
                Map & extras
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-success)]">Map selection</h4>
                  <p className="text-sm text-muted">
                    Pick any featured map, community upload, or let fate choose with{' '}
                    <strong>Random Map</strong>
                    (rolls at game start). Tooltips show territory counts, sectors, and ratings.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-primary)]">Color draft</h4>
                  <p className="text-sm text-muted">
                    Assign player colors manually or leave them random. Premium palettes respect
                    cosmetic unlocks if your profile has them.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-info)]">
                    Territory modifiers
                  </h4>
                  <p className="text-sm text-muted">
                    Toggle experimental bonus layouts (Sparse, Balanced, Abundant). Setting is
                    stored but currently requires backend wiring for live games—treat it as preview
                    functionality.
                  </p>
                </div>
                <div className="panel-muted space-y-1">
                  <h4 className="font-semibold text-[color:var(--color-warning)]">
                    Auto-naming & notes
                  </h4>
                  <p className="text-sm text-muted">
                    Auto-name spins up a dramatic lobby title based on your settings. Add a lobby
                    message to declare house rules or trash talk before troops even deploy.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default TutorialPage
