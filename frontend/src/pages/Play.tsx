import React from 'react';
import { Link } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';

const Play: React.FC = () => {
  const breadcrumbItems = [
    { label: 'Dashboard', link: '/dashboard', icon: '🏠' },
    { label: 'Play', icon: '🎮' }
  ];

  const gameOptions = [
    {
      title: 'Quick Match',
      description: 'Jump into a game instantly',
      icon: '🚀',
      path: '/play/quick-match',
      color: 'from-blue-600 to-purple-600'
    },
    {
      title: 'Ranked',
      description: 'Competitive ladder games',
      icon: '🏆',
      path: '/play/ranked',
      color: 'from-yellow-600 to-orange-600'
    },
    {
      title: 'Create Lobby',
      description: 'Host a custom game',
      icon: '➕',
      path: '/play/create',
      color: 'from-green-600 to-teal-600'
    },
    {
      title: 'Browse Lobbies',
      description: 'Join existing games',
      icon: '🔍',
      path: '/play/browse',
      color: 'from-indigo-600 to-blue-600'
    },
    {
      title: 'vs AI',
      description: 'Single player practice',
      icon: '🤖',
      path: '/play/ai',
      color: 'from-purple-600 to-pink-600'
    },
    {
      title: 'Tutorial',
      description: 'Learn to play Risk',
      icon: '📚',
      path: '/play/tutorial',
      color: 'from-red-600 to-pink-600'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} className="mb-6" />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-4">🎮 Choose Your Battle</h1>
        <p className="text-gray-400 text-lg">Select a game mode and begin your conquest</p>
      </div>

      {/* Game Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gameOptions.map((option) => (
          <Link
            key={option.path}
            to={option.path}
            className={`group bg-gradient-to-br ${option.color} rounded-xl p-6 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-2xl`}
          >
            <div className="text-center">
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">
                {option.icon}
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{option.title}</h3>
              <p className="text-gray-100 text-sm opacity-90">{option.description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="mt-12 bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center">
          <span className="mr-2">📊</span>
          Recent Activity
        </h2>
        <div className="text-gray-400 text-center py-8">
          <div className="text-4xl mb-4">🎯</div>
          <p>No recent games found. Start a game to see your activity here!</p>
        </div>
      </div>
    </div>
  );
};

export default Play;