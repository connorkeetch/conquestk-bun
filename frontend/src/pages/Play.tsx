import type React from 'react'
import { Link } from 'react-router-dom'

// import Breadcrumb from '../components/Breadcrumb';

const Play: React.FC = () => {
  const gameOptions = [
    {
      title: 'Casual',
      description: 'Jump into relaxed public games',
      icon: '🎮',
      path: '/play/casual',
      color: 'from-blue-600 to-purple-600',
    },
    {
      title: 'Ranked',
      description: 'Battle for ladder position',
      icon: '🏆',
      path: '/play/ranked',
      color: 'from-yellow-600 to-orange-600',
    },
    {
      title: 'Create Lobby',
      description: 'Host a custom game with friends',
      icon: '➕',
      path: '/create',
      color: 'from-green-600 to-teal-600',
    },
    {
      title: 'Browse Lobbies',
      description: 'Find existing rooms to join',
      icon: '🔍',
      path: '/lobby',
      color: 'from-indigo-600 to-blue-600',
    },
    {
      title: 'vs AI',
      description: 'Solo practice matches (coming soon)',
      icon: '🤖',
      path: '/play/ai',
      color: 'from-purple-600 to-pink-600',
      comingSoon: true,
    },
    {
      title: 'Tutorial',
      description: 'Learn the ropes before you play',
      icon: '📚',
      path: '/tutorial',
      color: 'from-red-600 to-pink-600',
    },
  ] satisfies Array<{
    title: string
    description: string
    icon: string
    path: string
    color: string
    comingSoon?: boolean
  }>

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-4">🎮 Choose Your Battle</h1>
        <p className="text-muted text-lg">Select a game mode and begin your conquest</p>
      </div>

      {/* Game Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gameOptions.map((option) => (
          <Link
            key={option.path}
            to={option.path}
            className={`group relative bg-white/5 backdrop-blur-md rounded-xl p-6 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 shadow-lg hover:shadow-2xl border border-white/10 hover:border-white/20 overflow-hidden`}
          >
            {/* Gradient accent */}
            <div
              className={`absolute inset-0 bg-gradient-to-br ${option.color} opacity-20 group-hover:opacity-30 transition-opacity duration-300`}
            ></div>
            <div className="relative text-center">
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">
                {option.icon}
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{option.title}</h3>
              <p className="text-gray-100 text-sm opacity-90">{option.description}</p>
              {option.comingSoon && (
                <span className="inline-block mt-3 bg-yellow-600/80 text-yellow-100 px-3 py-1 rounded-full text-xs font-semibold">
                  Coming Soon
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="mt-12 bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center">
          <span className="mr-2">📊</span>
          Recent Activity
        </h2>
        <div className="text-muted text-center py-8">
          <div className="text-4xl mb-4">🎯</div>
          <p>No recent games found. Start a game to see your activity here!</p>
        </div>
      </div>
    </div>
  )
}

export default Play
