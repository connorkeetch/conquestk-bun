import type React from 'react'
import { useState } from 'react'
import { BookOpen, Gamepad2, Trophy, Shield, Map, Zap, Users, Settings } from 'lucide-react'

const TutorialPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'basics' | 'gametypes' | 'strategy' | 'rankings' | 'maps' | 'options'>('basics')

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold gradient-text mb-2">How to Play</h1>
        <p className="text-gray-400">Master the art of conquest with our comprehensive guides</p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-8 border-b border-gray-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab('basics')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'basics' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Basics
        </button>
        <button
          onClick={() => setActiveTab('gametypes')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'gametypes' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          Game Types
        </button>
        <button
          onClick={() => setActiveTab('strategy')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'strategy' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Shield className="w-4 h-4" />
          Strategy
        </button>
        <button
          onClick={() => setActiveTab('rankings')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'rankings' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Rankings & ELO
        </button>
        <button
          onClick={() => setActiveTab('maps')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'maps' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Map className="w-4 h-4" />
          Maps
        </button>
        <button
          onClick={() => setActiveTab('options')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'options' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Settings className="w-4 h-4" />
          Game Options
        </button>
      </div>

      {/* Content Area */}
      <div className="bg-gray-800 rounded-lg p-6 min-h-[500px]">
        {activeTab === 'basics' && (
          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold text-white mb-4">Getting Started</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Objective</h3>
                <p className="text-gray-300">
                  The goal is simple: conquer territories, build armies, and eliminate all opponents to achieve global domination.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Turn Phases</h3>
                <div className="space-y-3">
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-yellow-400">1. Reinforce</h4>
                    <p className="text-gray-300 mt-1">
                      Place new troops on your territories. You receive troops based on the number of territories you control, 
                      plus bonuses for controlling entire continents.
                    </p>
                  </div>
                  
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-red-400">2. Attack</h4>
                    <p className="text-gray-300 mt-1">
                      Attack adjacent enemy territories. Roll dice to determine battle outcomes. The attacker can continue 
                      attacking until they choose to stop or run out of troops.
                    </p>
                  </div>
                  
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-400">3. Fortify</h4>
                    <p className="text-gray-300 mt-1">
                      Move troops from one of your territories to another connected territory to strengthen your defenses.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Basic Controls</h3>
                <ul className="text-gray-300 space-y-2">
                  <li>• Click on your territories during reinforcement to place troops</li>
                  <li>• Click and drag from your territory to an enemy territory to attack</li>
                  <li>• Use the mouse wheel or pinch to zoom the map</li>
                  <li>• Click and drag to pan around the map</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'gametypes' && (
          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold text-white mb-4">Game Types</h2>
            
            <div className="grid gap-6">
              <div className="bg-gray-700 p-5 rounded-lg">
                <h3 className="text-xl font-semibold text-green-400 mb-2">Classic Conquest</h3>
                <p className="text-gray-300">
                  The traditional game mode. Eliminate all opponents to win. Start with territories distributed evenly 
                  among players and fight for world domination.
                </p>
              </div>

              <div className="bg-gray-700 p-5 rounded-lg">
                <h3 className="text-xl font-semibold text-blue-400 mb-2">Capital Cities</h3>
                <p className="text-gray-300">
                  Each player has a capital city. Protect your capital while capturing enemy capitals. Lose your capital 
                  and you're eliminated immediately!
                </p>
              </div>

              <div className="bg-gray-700 p-5 rounded-lg">
                <h3 className="text-xl font-semibold text-purple-400 mb-2">Mission Mode</h3>
                <p className="text-gray-300">
                  Complete secret objectives to win. Missions might include controlling specific continents, eliminating 
                  certain players, or capturing a number of territories.
                </p>
              </div>

              <div className="bg-gray-700 p-5 rounded-lg">
                <h3 className="text-xl font-semibold text-yellow-400 mb-2">Blitz</h3>
                <p className="text-gray-300">
                  Fast-paced gameplay with turn timers. Make quick decisions or lose your turn. Perfect for players who 
                  want intense, rapid games.
                </p>
              </div>

              <div className="bg-gray-700 p-5 rounded-lg">
                <h3 className="text-xl font-semibold text-red-400 mb-2">Fog of War</h3>
                <p className="text-gray-300">
                  Limited visibility of the map. You can only see territories adjacent to your own. Adds an element of 
                  uncertainty and strategic planning.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'strategy' && (
          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold text-white mb-4">Strategic Tips</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Early Game</h3>
                <ul className="text-gray-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <Zap className="w-5 h-5 text-yellow-400 mt-0.5" />
                    <span>Focus on securing a continent early for bonus troops</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="w-5 h-5 text-yellow-400 mt-0.5" />
                    <span>Australia and South America are easier to defend with fewer borders</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="w-5 h-5 text-yellow-400 mt-0.5" />
                    <span>Don't spread your forces too thin - consolidate power</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Mid Game</h3>
                <ul className="text-gray-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <Shield className="w-5 h-5 text-green-400 mt-0.5" />
                    <span>Fortify your continent borders heavily</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="w-5 h-5 text-green-400 mt-0.5" />
                    <span>Form temporary alliances but remember - there can only be one winner</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="w-5 h-5 text-green-400 mt-0.5" />
                    <span>Watch for players getting too powerful and coordinate to stop them</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Late Game</h3>
                <ul className="text-gray-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <Trophy className="w-5 h-5 text-purple-400 mt-0.5" />
                    <span>Card sets become crucial - time your turn-ins wisely</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Trophy className="w-5 h-5 text-purple-400 mt-0.5" />
                    <span>Break enemy continents to reduce their reinforcement bonus</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Trophy className="w-5 h-5 text-purple-400 mt-0.5" />
                    <span>Keep a strong defensive line while pushing for elimination</span>
                  </li>
                </ul>
              </div>

              <div className="bg-gray-700 p-4 rounded-lg">
                <h3 className="text-xl font-semibold text-red-400 mb-3">Combat Tips</h3>
                <p className="text-gray-300">
                  • Attackers roll up to 3 dice, defenders roll up to 2<br/>
                  • Higher rolls win, ties go to the defender<br/>
                  • Attack with at least 3:2 ratio for better odds<br/>
                  • Leave strong defenses - never leave just 1 troop
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rankings' && (
          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold text-white mb-4">Rankings & ELO System</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">How ELO Works</h3>
                <p className="text-gray-300">
                  The ELO rating system measures your skill level based on game results. Everyone starts at 1200 ELO.
                  Win against higher-rated players to gain more points, lose to lower-rated players to lose more points.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Rank Tiers</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">🥉</span>
                    <div>
                      <div className="font-semibold text-orange-400">Bronze (800-1199)</div>
                      <div className="text-sm text-gray-400">New players learning the basics</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">🥈</span>
                    <div>
                      <div className="font-semibold text-gray-300">Silver (1200-1499)</div>
                      <div className="text-sm text-gray-400">Solid understanding of game mechanics</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">🥇</span>
                    <div>
                      <div className="font-semibold text-yellow-400">Gold (1500-1799)</div>
                      <div className="text-sm text-gray-400">Strong strategic players</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">💎</span>
                    <div>
                      <div className="font-semibold text-cyan-400">Diamond (1800-2099)</div>
                      <div className="text-sm text-gray-400">Expert tacticians</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">👑</span>
                    <div>
                      <div className="font-semibold text-purple-400">Master (2100+)</div>
                      <div className="text-sm text-gray-400">Elite commanders</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Earning Points</h3>
                <ul className="text-gray-300 space-y-2">
                  <li>• Win games to increase your rating</li>
                  <li>• Performance matters - eliminating more players gives bonus points</li>
                  <li>• Play ranked games for competitive matches</li>
                  <li>• Casual games don't affect your ELO</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'maps' && (
          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold text-white mb-4">Maps & Territories</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Official Maps</h3>
                <div className="grid gap-4">
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-400">Classic World</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      42 territories across 6 continents. The original and most balanced map.
                    </p>
                  </div>
                  
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-400">Europe Detailed</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      Focus on European territories with historical borders and regions.
                    </p>
                  </div>
                  
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-purple-400">Fantasy Realms</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      Magical kingdoms and territories in a fantasy world setting.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Continent Bonuses</h3>
                <table className="w-full text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="text-left py-2">Continent</th>
                      <th className="text-center py-2">Territories</th>
                      <th className="text-center py-2">Bonus Troops</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-700">
                      <td className="py-2">Australia</td>
                      <td className="text-center">4</td>
                      <td className="text-center text-green-400">+2</td>
                    </tr>
                    <tr className="border-b border-gray-700">
                      <td className="py-2">South America</td>
                      <td className="text-center">4</td>
                      <td className="text-center text-green-400">+2</td>
                    </tr>
                    <tr className="border-b border-gray-700">
                      <td className="py-2">Africa</td>
                      <td className="text-center">6</td>
                      <td className="text-center text-yellow-400">+3</td>
                    </tr>
                    <tr className="border-b border-gray-700">
                      <td className="py-2">North America</td>
                      <td className="text-center">9</td>
                      <td className="text-center text-yellow-400">+5</td>
                    </tr>
                    <tr className="border-b border-gray-700">
                      <td className="py-2">Europe</td>
                      <td className="text-center">7</td>
                      <td className="text-center text-orange-400">+5</td>
                    </tr>
                    <tr className="border-b border-gray-700">
                      <td className="py-2">Asia</td>
                      <td className="text-center">12</td>
                      <td className="text-center text-red-400">+7</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Custom Maps</h3>
                <p className="text-gray-300">
                  Create your own maps using the Map Editor! Design territories, set connections, and share with the community.
                </p>
                <ul className="text-gray-300 space-y-1 mt-3">
                  <li>• Draw territory boundaries</li>
                  <li>• Define continent groups</li>
                  <li>• Set custom bonus values</li>
                  <li>• Upload background images</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'options' && (
          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold text-white mb-4">Game Options</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Game Settings</h3>
                <div className="space-y-4">
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-yellow-400">Turn Timer</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      Set time limits for turns (30s, 60s, 90s, or unlimited). Keeps games moving quickly.
                    </p>
                  </div>
                  
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-400">Starting Troops</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      Choose how many troops each player starts with. More troops = longer games.
                    </p>
                  </div>
                  
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-400">Card Trade-In</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      Fixed bonuses (4, 6, 8, 10...) or progressive (4, 7, 10, 15, 20...). Progressive makes late game explosive.
                    </p>
                  </div>
                  
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-purple-400">Fog of War</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      Limited visibility adds mystery. You can only see territories adjacent to your own.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Room Options</h3>
                <ul className="text-gray-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <Users className="w-5 h-5 text-blue-400 mt-0.5" />
                    <span><strong>Player Count:</strong> 2-8 players per game</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="w-5 h-5 text-blue-400 mt-0.5" />
                    <span><strong>Private Games:</strong> Create password-protected rooms</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="w-5 h-5 text-blue-400 mt-0.5" />
                    <span><strong>AI Players:</strong> Fill empty slots with computer opponents</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="w-5 h-5 text-blue-400 mt-0.5" />
                    <span><strong>Spectators:</strong> Allow others to watch your game</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Advanced Options</h3>
                <div className="bg-gray-700 p-4 rounded-lg">
                  <ul className="text-gray-300 space-y-2">
                    <li>• <strong>Alliance Mode:</strong> Team up for 2v2 or 3v3 battles</li>
                    <li>• <strong>Zombie Mode:</strong> Eliminated players respawn as neutrals</li>
                    <li>• <strong>Capitals:</strong> Each player has a capital to defend</li>
                    <li>• <strong>Missions:</strong> Secret objectives for alternative victory</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TutorialPage