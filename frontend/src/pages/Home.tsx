import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';

interface GameRoom {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  map: string;
  timer?: string;
  theme?: string;
  status: 'waiting' | 'in-progress';
}

interface Feature {
  icon: string;
  title: string;
  description: string;
}

const Home: React.FC = () => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  const mockGameRooms: GameRoom[] = [];

  const features: Feature[] = [
    {
      icon: '🎲',
      title: 'Real-time Battles',
      description: 'Authentic dice mechanics with smooth animations'
    },
    {
      icon: '🌍',
      title: 'Multiple Maps',
      description: 'Classic world map plus themed variations'
    },
    {
      icon: '👥',
      title: '6 Player Support',
      description: 'Epic battles with up to 6 simultaneous players'
    },
    {
      icon: '🎨',
      title: 'Custom Themes',
      description: 'Choose from multiple visual themes'
    }
  ];

  const mockTerritories: any[] = [];


  const getPlayerAvatars = (count: number, maxCount: number) => {
    const avatars = [];
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    
    for (let i = 0; i < maxCount; i++) {
      if (i < count) {
        avatars.push(
          <div 
            key={i} 
            className="w-8 h-8 rounded-full border-2 border-gray-600 flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: colors[i] }}
          >
            {letters[i]}
          </div>
        );
      } else {
        avatars.push(
          <div 
            key={i} 
            className="w-8 h-8 rounded-full border-2 border-gray-600 bg-gray-700 flex items-center justify-center text-xs text-gray-400"
          >
            ?
          </div>
        );
      }
    }
    return avatars;
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-transparent"></div>
        
        {/* Content */}
        <div className="relative container mx-auto px-8 py-16 text-center">
          <h1 className="text-6xl font-bold mb-6 gradient-text">
            Conquer the World
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Strategic multiplayer warfare. Command armies, forge alliances, dominate territories.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isAuthenticated ? (
              <>
                <Link to="/lobby" className="btn btn-primary btn-lg">
                  ⚡ Quick Match
                </Link>
                <Link to="/lobby" className="btn btn-secondary btn-lg">
                  🎮 Create Private Room
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary btn-lg">
                  ⚡ Join the Battle
                </Link>
                <Link to="/simple-map" className="btn btn-secondary btn-lg">
                  🎮 Try Demo
                </Link>
              </>
            )}
          </div>
        </div>
      </section>


      {/* Active Games Lobby */}
      {isAuthenticated && (
        <section className="container mx-auto px-8 py-16">
          <h2 className="text-3xl font-bold text-center mb-12">Active Games</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockGameRooms.map((room) => (
              <div key={room.id} className="card hover:border-blue-500 cursor-pointer transition-all duration-300">
                <div className="card-header">
                  <h3 className="card-title">{room.name}</h3>
                  <span className="badge badge-success">
                    {room.players}/{room.maxPlayers} Players
                  </span>
                </div>
                
                <div className="card-body">
                  <div className="flex gap-2 mb-4">
                    {getPlayerAvatars(room.players, room.maxPlayers)}
                  </div>
                  
                  <div className="flex gap-4 text-sm text-gray-400">
                    {room.timer && <span>⏱️ {room.timer}</span>}
                    <span>🗺️ {room.map}</span>
                  </div>
                </div>
                
                <div className="card-footer">
                  <button className="btn btn-primary w-full">Join Game</button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="text-center mt-8">
            <Link to="/play" className="btn btn-secondary">
              View All Games
            </Link>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="container mx-auto px-8 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="bg-slate-800/50 rounded-lg p-8 text-center border border-slate-700">
            <h2 className="text-2xl font-bold text-slate-100 mb-6">Game Features</h2>
            <div className="text-slate-300 space-y-3 select-none">
              <p><span className="text-2xl mr-2">🎲</span> <strong>Real-time Battles</strong> - Authentic dice mechanics with smooth animations</p>
              <p><span className="text-2xl mr-2">🌍</span> <strong>Multiple Maps</strong> - Classic world map plus themed variations</p>
              <p><span className="text-2xl mr-2">👥</span> <strong>6 Player Support</strong> - Epic battles with up to 6 simultaneous players</p>
              <p><span className="text-2xl mr-2">🎨</span> <strong>Custom Themes</strong> - Choose from multiple visual themes</p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      {!isAuthenticated && (
        <section className="container mx-auto px-8 py-16 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-4xl font-bold mb-4">Ready to Begin Your Conquest?</h2>
            <p className="text-gray-300 mb-8">
              Join thousands of strategists in the ultimate battle for world domination
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register" className="btn btn-primary btn-lg">
                Create Account
              </Link>
              <Link to="/login" className="btn btn-secondary btn-lg">
                Sign In
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;