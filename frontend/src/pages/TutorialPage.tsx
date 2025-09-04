import type React from 'react'
import { useState } from 'react'
import { BookOpen, Gamepad2, Trophy, Shield, Map, Zap, Users, Settings } from 'lucide-react'

const TutorialPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'basics' | 'gametypes' | 'strategy' | 'rankings' | 'editor' | 'options'>('basics')

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
          onClick={() => setActiveTab('editor')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'editor' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Map className="w-4 h-4" />
          Map Editor
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
            <h2 className="text-2xl font-bold text-white mb-4">The Conqueror's Path - Ranking System</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">How ELO Works</h3>
                <p className="text-gray-300">
                  The ELO rating system measures your skill level based on game results. Everyone starts at 1000 ELO.
                  Win against higher-rated players to gain more points, lose to lower-rated players to lose more points.
                  Your journey follows the path of history's greatest conquerors!
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">The Conqueror's Path</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">🛡️</span>
                    <div>
                      <div className="font-semibold text-amber-700">Chieftain (0-599)</div>
                      <div className="text-sm text-gray-400">Leads a tribe or small clan, fighting for survival • Example: Vercingetorix</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">⚔️</span>
                    <div>
                      <div className="font-semibold text-red-600">Warlord (600-799)</div>
                      <div className="text-sm text-gray-400">Rules by might, feared by neighboring villages • Example: Shaka Zulu</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">⚓</span>
                    <div>
                      <div className="font-semibold text-blue-500">Raider King (800-999)</div>
                      <div className="text-sm text-gray-400">Expands by plunder and coastal terror • Example: Ragnar Lothbrok</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">☪️</span>
                    <div>
                      <div className="font-semibold text-green-600">Sultan (1000-1199)</div>
                      <div className="text-sm text-gray-400">Wields faith and politics alongside armies • Example: Saladin</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">🦅</span>
                    <div>
                      <div className="font-semibold text-yellow-500">Caesar (1200-1399)</div>
                      <div className="text-sm text-gray-400">Transforms republic into empire • Example: Julius Caesar</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">🏹</span>
                    <div>
                      <div className="font-semibold text-orange-500">Khan (1400-1599)</div>
                      <div className="text-sm text-gray-400">Masters of cavalry and mobility • Example: Genghis Khan</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">👑</span>
                    <div>
                      <div className="font-semibold text-purple-500">Emperor (1600-1799)</div>
                      <div className="text-sm text-gray-400">Commands massive armies • Example: Napoleon Bonaparte</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">☀️</span>
                    <div>
                      <div className="font-semibold text-orange-400">The Great King (1800-1999)</div>
                      <div className="text-sm text-gray-400">Ruler of kings, empire spanning continents • Example: Alexander the Great</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">💀</span>
                    <div>
                      <div className="font-semibold text-gray-600">Overlord (2000-2199)</div>
                      <div className="text-sm text-gray-400">Tyrant who demands tribute and burns resistance • Example: Attila the Hun</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                    <span className="text-2xl">☄️</span>
                    <div>
                      <div className="font-semibold text-red-800">Worldbreaker (2200+)</div>
                      <div className="text-sm text-gray-400">Apocalyptic conqueror, remembered for brutality • Example: Tamerlane</div>
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

        {activeTab === 'editor' && (
          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold text-white mb-4">Map Editor Guide</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Getting Started</h3>
                <p className="text-gray-300 mb-3">
                  Create your own custom maps using our intuitive token-based map editor. Share your creations with the community!
                </p>
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h4 className="font-semibold text-yellow-400 mb-2">Quick Start Steps:</h4>
                  <ol className="text-gray-300 space-y-1 list-decimal list-inside">
                    <li>Upload a background image (400×300 minimum)</li>
                    <li>Place territory tokens on strategic locations</li>
                    <li>Create continents and assign territories (optional)</li>
                    <li>Connect territories to define borders</li>
                    <li>Set up capital positions for different player counts</li>
                    <li>Save to database and submit for approval</li>
                  </ol>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Editor Modes</h3>
                <div className="grid gap-3">
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-400">🗺️ Territories Mode</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      Click to place territory tokens. Drag to reposition. Select a continent first to auto-assign new territories.
                    </p>
                  </div>
                  
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-400">🌍 Continents Mode</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      Create continent groups with bonus army values. Assign colors for visual distinction.
                    </p>
                  </div>
                  
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-purple-400">🔗 Connections Mode</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      Click a territory, then click adjacent territories to create connections. These define attack paths.
                    </p>
                  </div>
                  
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold text-yellow-400">👑 Capitals Mode</h4>
                    <p className="text-gray-300 text-sm mt-1">
                      Auto-generate or manually assign starting positions for 2-12 players using our fair distribution system.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Capital Assignment System</h3>
                <p className="text-gray-300 mb-3">
                  The new capital system ensures balanced starting positions for all player counts:
                </p>
                <ul className="text-gray-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-green-400">✨</span>
                    <span><strong>Auto-Generation:</strong> Uses maximin distance algorithm to maximize spacing between starting positions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">🎯</span>
                    <span><strong>Manual Override:</strong> Click territories in Capitals mode to customize assignments</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">👥</span>
                    <span><strong>Player-Specific:</strong> Different optimal configurations for 2-12 players</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-400">⚖️</span>
                    <span><strong>Fair Play:</strong> Ensures no player has an unfair starting advantage</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Map Requirements</h3>
                <table className="w-full text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="text-left py-2">Feature</th>
                      <th className="text-center py-2">Minimum</th>
                      <th className="text-center py-2">Recommended</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-700">
                      <td className="py-2">Territories</td>
                      <td className="text-center text-yellow-400">2</td>
                      <td className="text-center text-green-400">20-50</td>
                    </tr>
                    <tr className="border-b border-gray-700">
                      <td className="py-2">Continents</td>
                      <td className="text-center text-yellow-400">0 (optional)</td>
                      <td className="text-center text-green-400">3-7</td>
                    </tr>
                    <tr className="border-b border-gray-700">
                      <td className="py-2">Image Size</td>
                      <td className="text-center text-yellow-400">400×300</td>
                      <td className="text-center text-green-400">1200×800</td>
                    </tr>
                    <tr className="border-b border-gray-700">
                      <td className="py-2">File Size</td>
                      <td className="text-center text-yellow-400">&lt; 10MB</td>
                      <td className="text-center text-green-400">&lt; 2MB</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Getting Maps Approved</h3>
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h4 className="font-semibold text-green-400 mb-2">Approval Process:</h4>
                  <ol className="text-gray-300 space-y-2 list-decimal list-inside">
                    <li><strong>Validation:</strong> Automatic checks for minimum requirements</li>
                    <li><strong>Playability:</strong> All territories must be connected</li>
                    <li><strong>Balance:</strong> Fair distribution of territories and continents</li>
                    <li><strong>Quality:</strong> Clear visuals and appropriate theme</li>
                    <li><strong>Community Review:</strong> Players test and rate your map</li>
                    <li><strong>Admin Approval:</strong> Final check before publication</li>
                  </ol>
                  <p className="text-gray-400 text-sm mt-3">
                    💡 Tip: Well-balanced maps with interesting themes get approved faster!
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-400 mb-3">Advanced Features</h3>
                <ul className="text-gray-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">📏</span>
                    <span><strong>Grid Snap:</strong> Enable grid for precise territory placement</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">🔄</span>
                    <span><strong>Import/Export:</strong> Save work as JSON for backup or sharing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400">🎨</span>
                    <span><strong>Token Shapes:</strong> Choose hexagon, square, or circle tokens</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-400">🔍</span>
                    <span><strong>Image Scaling:</strong> Adjust background size (50%-150%)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400">✂️</span>
                    <span><strong>Smart Cropping:</strong> Crop images to perfect dimensions</span>
                  </li>
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