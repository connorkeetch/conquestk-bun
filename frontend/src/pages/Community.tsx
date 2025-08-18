import React from 'react';
import { Link } from 'react-router-dom';
import Breadcrumb from '../components/navigation/Breadcrumb';

const Community: React.FC = () => {
  const breadcrumbItems = [
    { label: 'Dashboard', link: '/dashboard', icon: '🏠' },
    { label: 'Community', icon: '👥' }
  ];

  const communityFeatures = [
    {
      title: 'Leaderboards',
      description: 'See who rules the world',
      icon: '🏆',
      path: '/community/leaderboards',
      color: 'from-yellow-600 to-orange-600',
      stats: '1,234 players ranked'
    },
    {
      title: 'Tournaments',
      description: 'Compete in organized events',
      icon: '🎪',
      path: '/community/tournaments',
      color: 'from-purple-600 to-pink-600',
      stats: '3 active tournaments'
    },
    {
      title: 'Friends',
      description: 'Connect with other players',
      icon: '👫',
      path: '/community/friends',
      color: 'from-green-600 to-teal-600',
      stats: '42 friends online'
    },
    {
      title: 'Chat Rooms',
      description: 'Join the conversation',
      icon: '💬',
      path: '/community/chat',
      color: 'from-blue-600 to-indigo-600',
      stats: '156 players chatting'
    }
  ];

  const topPlayers = [
    { rank: 1, name: 'WorldConqueror', wins: 1247, rating: 2450, flag: '👑' },
    { rank: 2, name: 'StrategyMaster', wins: 1089, rating: 2380, flag: '🥈' },
    { rank: 3, name: 'TerritoryKing', wins: 967, rating: 2290, flag: '🥉' },
    { rank: 4, name: 'BattleLord', wins: 834, rating: 2156, flag: '🛡️' },
    { rank: 5, name: 'MapDominator', wins: 756, rating: 2089, flag: '⚔️' }
  ];

  const recentActivity = [
    { user: 'DragonSlayer', action: 'won a tournament match', time: '5 min ago', icon: '🏆' },
    { user: 'IceQueen', action: 'created a new map: Arctic Wasteland', time: '12 min ago', icon: '🗺️' },
    { user: 'ForestWarden', action: 'joined the Global Championship', time: '23 min ago', icon: '🎪' },
    { user: 'DesertKing', action: 'achieved a 10-win streak', time: '1 hour ago', icon: '🔥' }
  ];

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} className="mb-6" />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-4">👥 Community Hub</h1>
        <p className="text-gray-400 text-lg">Connect, compete, and conquer together</p>
      </div>

      {/* Community Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
          <div className="text-2xl font-bold text-blue-400">12,456</div>
          <div className="text-sm text-gray-400">Active Players</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
          <div className="text-2xl font-bold text-green-400">3,789</div>
          <div className="text-sm text-gray-400">Games Today</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
          <div className="text-2xl font-bold text-purple-400">567</div>
          <div className="text-sm text-gray-400">Custom Maps</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
          <div className="text-2xl font-bold text-yellow-400">89</div>
          <div className="text-sm text-gray-400">Tournaments</div>
        </div>
      </div>

      {/* Community Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {communityFeatures.map((feature) => (
          <Link
            key={feature.path}
            to={feature.path}
            className={`group bg-gradient-to-br ${feature.color} rounded-xl p-6 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-2xl`}
          >
            <div className="text-center">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-100 text-sm opacity-90 mb-3">{feature.description}</p>
              <div className="text-xs text-gray-200 opacity-75">{feature.stats}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Players */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center">
            <span className="mr-2">🏆</span>
            Top Players This Week
          </h2>
          <div className="space-y-3">
            {topPlayers.map((player) => (
              <div key={player.rank} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="w-8 text-center">
                    <span className="text-lg">{player.flag}</span>
                  </div>
                  <div>
                    <div className="font-medium text-white">{player.name}</div>
                    <div className="text-sm text-gray-400">{player.wins} wins</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-yellow-400">{player.rating}</div>
                  <div className="text-xs text-gray-500">Rating</div>
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/community/leaderboards"
            className="block mt-4 text-center text-blue-400 hover:text-blue-300 text-sm font-medium"
          >
            View Full Leaderboard →
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center">
            <span className="mr-2">📊</span>
            Recent Activity
          </h2>
          <div className="space-y-4">
            {recentActivity.map((activity, index) => (
              <div key={index} className="flex items-center space-x-4 p-3 bg-gray-700/30 rounded-lg">
                <div className="text-2xl">{activity.icon}</div>
                <div className="flex-1">
                  <div className="text-white">
                    <span className="font-medium text-blue-400">{activity.user}</span>
                    {' '}
                    <span className="text-gray-300">{activity.action}</span>
                  </div>
                  <div className="text-sm text-gray-500">{activity.time}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <button className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View All Activity →
            </button>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="mt-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Join the Community</h2>
        <p className="text-blue-100 mb-6">Connect with players from around the world and climb the ranks!</p>
        <div className="flex justify-center space-x-4">
          <Link
            to="/community/tournaments"
            className="bg-white/20 hover:bg-white/30 px-6 py-3 rounded-lg font-medium transition-all duration-200 text-white"
          >
            Join Tournament
          </Link>
          <Link
            to="/community/friends"
            className="bg-white/20 hover:bg-white/30 px-6 py-3 rounded-lg font-medium transition-all duration-200 text-white"
          >
            Find Friends
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Community;