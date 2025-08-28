import { AlertCircle, Calendar, Crown, Medal, Skull, TrendingUp, Trophy } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'

interface LeaderboardEntry {
  id: string
  username: string
  elo: number
  wins: number
  losses: number
  winRate: number
  rank: number
  monthlyGames?: number
  monthlyWins?: number
  isVillain?: boolean
}

const LeaderboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'global' | 'monthly' | 'friends' | 'clans'>('global')
  const [showVillainCelebration, setShowVillainCelebration] = useState(false)
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[]>([])
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<LeaderboardEntry[]>([])
  const [currentVillain, setCurrentVillain] = useState<LeaderboardEntry | null>(null)

  // Mock data for demonstration
  useEffect(() => {
    // Mock global leaderboard
    const mockGlobal: LeaderboardEntry[] = [
      {
        id: '1',
        username: 'AlexTheConqueror',
        elo: 2145,
        wins: 342,
        losses: 156,
        winRate: 68.7,
        rank: 1,
      },
      {
        id: '2',
        username: 'StrategistKing',
        elo: 2098,
        wins: 298,
        losses: 142,
        winRate: 67.7,
        rank: 2,
      },
      {
        id: '3',
        username: 'TacticalGenius',
        elo: 2034,
        wins: 276,
        losses: 138,
        winRate: 66.7,
        rank: 3,
      },
      {
        id: '4',
        username: 'BattleMaster',
        elo: 1987,
        wins: 254,
        losses: 146,
        winRate: 63.5,
        rank: 4,
      },
      { id: '5', username: 'WarChief', elo: 1945, wins: 232, losses: 128, winRate: 64.4, rank: 5 },
    ]
    setGlobalLeaderboard(mockGlobal)

    // Mock monthly leaderboard with villain
    const mockMonthly: LeaderboardEntry[] = [
      {
        id: '1',
        username: 'TheVillain',
        elo: 1876,
        wins: 45,
        losses: 12,
        winRate: 78.9,
        rank: 1,
        monthlyGames: 57,
        monthlyWins: 45,
        isVillain: true,
      },
      {
        id: '2',
        username: 'ChallengerOne',
        elo: 1834,
        wins: 38,
        losses: 15,
        winRate: 71.7,
        rank: 2,
        monthlyGames: 53,
        monthlyWins: 38,
      },
      {
        id: '3',
        username: 'MonthlyHero',
        elo: 1798,
        wins: 35,
        losses: 18,
        winRate: 66.0,
        rank: 3,
        monthlyGames: 53,
        monthlyWins: 35,
      },
      {
        id: '4',
        username: 'RisingStar',
        elo: 1756,
        wins: 32,
        losses: 20,
        winRate: 61.5,
        rank: 4,
        monthlyGames: 52,
        monthlyWins: 32,
      },
      {
        id: '5',
        username: 'Competitor',
        elo: 1712,
        wins: 28,
        losses: 22,
        winRate: 56.0,
        rank: 5,
        monthlyGames: 50,
        monthlyWins: 28,
      },
    ]
    setMonthlyLeaderboard(mockMonthly)
    setCurrentVillain(mockMonthly[0])
  }, [])

  // Simulate becoming the villain
  const handleBecomeVillain = () => {
    setShowVillainCelebration(true)
    setTimeout(() => setShowVillainCelebration(false), 5000)
  }

  const renderLeaderboardTable = (data: LeaderboardEntry[], isMonthly = false) => {
    return (
      <div className="bg-gray-800/50 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-900/50">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Rank</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Player</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">ELO</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">
                {isMonthly ? 'Monthly Wins' : 'Wins'}
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">
                {isMonthly ? 'Monthly Games' : 'Losses'}
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">Win Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {data.map((entry) => (
              <tr
                key={entry.id}
                className={`hover:bg-gray-700/30 transition-colors ${
                  entry.isVillain ? 'bg-purple-900/20' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {entry.rank === 1 && isMonthly && entry.isVillain && (
                      <Skull className="w-5 h-5 text-purple-400 animate-pulse" />
                    )}
                    {entry.rank === 1 && !entry.isVillain && (
                      <Trophy className="w-5 h-5 text-yellow-400" />
                    )}
                    {entry.rank === 2 && <Medal className="w-5 h-5 text-gray-400" />}
                    {entry.rank === 3 && <Medal className="w-5 h-5 text-amber-600" />}
                    <span
                      className={`font-bold ${entry.rank <= 3 ? 'text-white' : 'text-gray-400'}`}
                    >
                      #{entry.rank}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium ${entry.isVillain ? 'text-purple-400' : 'text-white'}`}
                    >
                      {entry.username}
                    </span>
                    {entry.isVillain && (
                      <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded-full">
                        VILLAIN OF THE MONTH
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-semibold text-blue-400">{entry.elo}</span>
                </td>
                <td className="px-4 py-3 text-center text-green-400">
                  {isMonthly ? entry.monthlyWins : entry.wins}
                </td>
                <td className="px-4 py-3 text-center text-red-400">
                  {isMonthly ? entry.monthlyGames : entry.losses}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span className="font-medium">{entry.winRate}%</span>
                    {entry.winRate > 70 && <TrendingUp className="w-4 h-4 text-green-400" />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Villain Celebration Modal */}
      {showVillainCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-purple-900/90 to-black p-8 rounded-2xl border border-purple-500/50 max-w-md text-center animate-bounce-in">
            <Skull className="w-24 h-24 text-purple-400 mx-auto mb-4 animate-pulse" />
            <h2 className="text-3xl font-bold text-white mb-2">You've Done It!</h2>
            <p className="text-xl text-purple-300 mb-1">You're the Big,</p>
            <p className="text-xl text-purple-300 mb-1">the Bad,</p>
            <p className="text-2xl font-bold text-purple-400 mb-4">the VILLAIN!</p>
            <p className="text-gray-300 mb-6">Your reign of terror begins now. Show no mercy!</p>
            <button
              onClick={() => setShowVillainCelebration(false)}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              Begin My Reign
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">Leaderboard</h1>
          <p className="text-gray-400">Top players and competitive rankings</p>
        </div>

        {/* Villain of the Month Display */}
        {currentVillain && activeTab === 'monthly' && (
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Skull className="w-8 h-8 text-purple-400 animate-pulse" />
              <div>
                <p className="text-sm text-purple-300">Current Villain</p>
                <p className="text-lg font-bold text-purple-400">{currentVillain.username}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-8 border-b border-gray-700">
        <button
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'global'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('global')}
        >
          <Trophy className="inline-block w-4 h-4 mr-2" />
          Global Rankings
        </button>
        <button
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'monthly'
              ? 'text-purple-400 border-b-2 border-purple-400'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('monthly')}
        >
          <Calendar className="inline-block w-4 h-4 mr-2" />
          Monthly Board
        </button>
        <button
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'friends'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('friends')}
        >
          👥 Friends
        </button>
        <button
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'clans'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('clans')}
        >
          ⚔️ Clans
        </button>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'global' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">All-Time Rankings</h2>
            <p className="text-sm text-gray-400">Updated every game</p>
          </div>
          {renderLeaderboardTable(globalLeaderboard)}
        </div>
      )}

      {activeTab === 'monthly' && (
        <div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Monthly Competition</h2>
              <div className="flex items-center gap-4">
                <p className="text-sm text-gray-400">Resets: 1st of each month</p>
                <button
                  onClick={handleBecomeVillain}
                  className="text-xs bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 px-3 py-1 rounded transition-colors"
                >
                  Test Villain Message
                </button>
              </div>
            </div>

            {/* Monthly board explanation */}
            <div className="bg-yellow-900/10 border border-yellow-600/30 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-200">
                <p className="font-semibold mb-1">Villain of the Month Competition</p>
                <p>
                  Every month starts fresh! The highest ranked player becomes the{' '}
                  <span className="text-purple-400 font-bold">Villain of the Month</span> - the one
                  everyone wants to defeat. Can you claim the throne or will you be the hero who
                  stops them?
                </p>
              </div>
            </div>

            {renderLeaderboardTable(monthlyLeaderboard, true)}
          </div>
        </div>
      )}

      {activeTab === 'friends' && (
        <div className="text-center text-gray-400 py-16">
          <div className="text-6xl mb-4">👥</div>
          <p className="text-lg">Friends leaderboard coming soon</p>
          <p className="text-sm mt-2">Compare your performance with friends</p>
        </div>
      )}

      {activeTab === 'clans' && (
        <div className="text-center text-gray-400 py-16">
          <div className="text-6xl mb-4">⚔️</div>
          <p className="text-lg">Clan rankings coming soon</p>
          <p className="text-sm mt-2">Compete as a team for glory</p>
        </div>
      )}
    </div>
  )
}

export default LeaderboardPage
