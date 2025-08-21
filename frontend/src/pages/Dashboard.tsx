import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';
// import Breadcrumb from '../components/Breadcrumb';

interface RecentGame {
  id: string;
  mapName: string;
  players: number;
  status: 'completed' | 'in_progress' | 'waiting';
  result?: 'won' | 'lost';
  lastPlayed: Date;
}

interface FriendActivity {
  id: string;
  username: string;
  activity: string;
  timestamp: Date;
  online: boolean;
}

interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  favoriteMap: string;
  totalPlaytime: number;
  currentStreak: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [friendsActivity, setFriendsActivity] = useState<FriendActivity[]>([]);
  const [notifications, setNotifications] = useState<number>(3); // Mock notification count

  useEffect(() => {
    // Mock data - replace with actual API calls
    setUserStats({
      gamesPlayed: 127,
      gamesWon: 89,
      winRate: 70,
      favoriteMap: 'Classic World',
      totalPlaytime: 2340, // minutes
      currentStreak: 3
    });

    setRecentGames([
      {
        id: '1',
        mapName: 'Classic World',
        players: 6,
        status: 'completed',
        result: 'won',
        lastPlayed: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      },
      {
        id: '2',
        mapName: 'Europe',
        players: 4,
        status: 'in_progress',
        lastPlayed: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
      },
      {
        id: '3',
        mapName: 'Fantasy Realms',
        players: 5,
        status: 'completed',
        result: 'lost',
        lastPlayed: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
      }
    ]);

    setFriendsActivity([
      {
        id: '1',
        username: 'DragonLord',
        activity: 'Won a game on Classic World',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        online: true
      },
      {
        id: '2',
        username: 'IceQueen',
        activity: 'Created a new map: Arctic Wasteland',
        timestamp: new Date(Date.now() - 45 * 60 * 1000),
        online: true
      },
      {
        id: '3',
        username: 'ForestWarden',
        activity: 'Joined a tournament',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        online: false
      }
    ]);
  }, []);

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const formatPlaytime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const getGameStatusColor = (status: string, result?: string) => {
    if (status === 'in_progress') return 'text-yellow-400';
    if (status === 'completed' && result === 'won') return 'text-green-400';
    if (status === 'completed' && result === 'lost') return 'text-red-400';
    return 'text-blue-400';
  };

  const getGameStatusText = (status: string, result?: string) => {
    if (status === 'in_progress') return 'In Progress';
    if (status === 'completed' && result === 'won') return 'Victory';
    if (status === 'completed' && result === 'lost') return 'Defeat';
    return 'Waiting';
  };


  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">

      {/* Welcome Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              Welcome back, {user?.username}! 👋
            </h1>
            <p className="text-gray-400 mt-2">Ready to conquer some territories?</p>
          </div>
          {notifications > 0 && (
            <div className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
              {notifications} new notifications
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Link
          to="/play/quick-match"
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl p-6 transition-all duration-200 transform hover:scale-105 shadow-lg"
        >
          <div className="text-center">
            <div className="text-3xl mb-3">🚀</div>
            <h3 className="text-xl font-bold text-white mb-2">Quick Match</h3>
            <p className="text-blue-100 text-sm">Find a game instantly</p>
          </div>
        </Link>

        <Link
          to="/play/create"
          className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 rounded-xl p-6 transition-all duration-200 transform hover:scale-105 shadow-lg"
        >
          <div className="text-center">
            <div className="text-3xl mb-3">➕</div>
            <h3 className="text-xl font-bold text-white mb-2">Create Lobby</h3>
            <p className="text-green-100 text-sm">Host a custom game</p>
          </div>
        </Link>

        <Link
          to="/maps"
          className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 rounded-xl p-6 transition-all duration-200 transform hover:scale-105 shadow-lg"
        >
          <div className="text-center">
            <div className="text-3xl mb-3">🗺️</div>
            <h3 className="text-xl font-bold text-white mb-2">Explore Maps</h3>
            <p className="text-orange-100 text-sm">Discover new territories</p>
          </div>
        </Link>

        <Link
          to="/community/tournaments"
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl p-6 transition-all duration-200 transform hover:scale-105 shadow-lg"
        >
          <div className="text-center">
            <div className="text-3xl mb-3">🏆</div>
            <h3 className="text-xl font-bold text-white mb-2">Tournaments</h3>
            <p className="text-purple-100 text-sm">Compete for glory</p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Stats Overview */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center">
              <span className="mr-2">📊</span>
              Your Stats
            </h2>
            {userStats && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Games Played</span>
                  <span className="text-white font-bold">{userStats.gamesPlayed}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Games Won</span>
                  <span className="text-green-400 font-bold">{userStats.gamesWon}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Win Rate</span>
                  <span className="text-blue-400 font-bold">{userStats.winRate}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Current Streak</span>
                  <span className="text-yellow-400 font-bold">{userStats.currentStreak}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Total Playtime</span>
                  <span className="text-purple-400 font-bold">{formatPlaytime(userStats.totalPlaytime)}</span>
                </div>
                <div className="pt-2 border-t border-gray-700">
                  <span className="text-gray-400 text-sm">Favorite Map</span>
                  <div className="text-white font-medium">{userStats.favoriteMap}</div>
                </div>
              </div>
            )}
            <Link
              to="/profile/stats"
              className="block mt-4 text-center text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              View Detailed Stats →
            </Link>
          </div>
        </div>

        {/* Recent Games */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center">
              <span className="mr-2">🎮</span>
              Recent Games
            </h2>
            <div className="space-y-4">
              {recentGames.map((game) => (
                <div key={game.id} className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center">
                      🗺️
                    </div>
                    <div>
                      <div className="font-medium text-white">{game.mapName}</div>
                      <div className="text-sm text-gray-400">{game.players} players • {getTimeAgo(game.lastPlayed)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${getGameStatusColor(game.status, game.result)}`}>
                      {getGameStatusText(game.status, game.result)}
                    </div>
                    {game.status === 'in_progress' && (
                      <Link
                        to={`/room/${game.id}`}
                        className="text-sm text-blue-400 hover:text-blue-300"
                      >
                        Continue →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/profile/history"
              className="block mt-4 text-center text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              View All Games →
            </Link>
          </div>

          {/* Friends Activity */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center">
              <span className="mr-2">👥</span>
              Friends Activity
            </h2>
            <div className="space-y-4">
              {friendsActivity.map((activity) => (
                <div key={activity.id} className="flex items-center space-x-4 p-3 bg-gray-700/30 rounded-lg">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-sm font-bold text-white">
                      {activity.username.charAt(0)}
                    </div>
                    {activity.online && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-800"></div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-medium">{activity.username}</div>
                    <div className="text-gray-400 text-sm">{activity.activity}</div>
                  </div>
                  <div className="text-gray-500 text-xs">{getTimeAgo(activity.timestamp)}</div>
                </div>
              ))}
            </div>
            <Link
              to="/community/friends"
              className="block mt-4 text-center text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              View All Friends →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;