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
  const [currentPhase, setCurrentPhase] = useState<'REINFORCE' | 'ATTACK' | 'FORTIFY'>('ATTACK');

  const mockGameRooms: GameRoom[] = [
    {
      id: '1',
      name: 'World Domination',
      players: 4,
      maxPlayers: 6,
      map: 'Classic Map',
      timer: '2min',
      status: 'waiting'
    },
    {
      id: '2',
      name: "Pirate's Cove",
      players: 2,
      maxPlayers: 4,
      map: 'Pirate Theme',
      status: 'waiting'
    },
    {
      id: '3',
      name: 'Speed Conquest',
      players: 5,
      maxPlayers: 6,
      map: 'Small Map',
      timer: '30s',
      status: 'waiting'
    }
  ];

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

  const mockTerritories = [
    { id: '1', x: 20, y: 25, armies: 8, player: 1 },
    { id: '2', x: 30, y: 20, armies: 5, player: 2 },
    { id: '3', x: 40, y: 30, armies: 12, player: 1 },
    { id: '4', x: 25, y: 40, armies: 3, player: 3 },
    { id: '5', x: 50, y: 25, armies: 7, player: 4 },
    { id: '6', x: 60, y: 35, armies: 15, player: 1 },
    { id: '7', x: 70, y: 30, armies: 9, player: 2 },
    { id: '8', x: 35, y: 50, armies: 4, player: 3 },
    { id: '9', x: 55, y: 45, armies: 6, player: 4 },
    { id: '10', x: 45, y: 60, armies: 10, player: 1 },
    { id: '11', x: 65, y: 55, armies: 11, player: 2 },
    { id: '12', x: 75, y: 50, armies: 2, player: 3 }
  ];

  const getPlayerColor = (player: number): string => {
    const colors = ['', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    return colors[player] || '#6b7280';
  };

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

      {/* Game Preview */}
      <section className="container mx-auto px-8 py-16">
        <div className="card max-w-6xl mx-auto overflow-hidden">
          {/* Game Header */}
          <div className="card-header bg-gray-800 border-b border-gray-700">
            <div className="flex gap-4">
              <button 
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  currentPhase === 'REINFORCE' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
                onClick={() => setCurrentPhase('REINFORCE')}
              >
                REINFORCE
              </button>
              <button 
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  currentPhase === 'ATTACK' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
                onClick={() => setCurrentPhase('ATTACK')}
              >
                ATTACK
              </button>
              <button 
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  currentPhase === 'FORTIFY' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
                onClick={() => setCurrentPhase('FORTIFY')}
              >
                FORTIFY
              </button>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-400">Turn 12</span>
              <span className="text-blue-400 font-bold">Your Turn</span>
            </div>
          </div>

          {/* Game Board Mock */}
          <div className="relative h-96 bg-gradient-to-br from-blue-900 to-purple-900 overflow-hidden">
            {mockTerritories.map((territory) => (
              <div
                key={territory.id}
                className="absolute w-12 h-12 rounded-full border-4 border-white flex items-center justify-center font-bold cursor-pointer transition-all duration-300 hover:scale-125 hover:z-10 shadow-lg"
                style={{
                  left: `${territory.x}%`,
                  top: `${territory.y}%`,
                  backgroundColor: getPlayerColor(territory.player),
                  transform: 'translate(-50%, -50%)'
                }}
              >
                {territory.armies}
              </div>
            ))}
            
            {/* Game Phase Indicator */}
            <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg p-3">
              <div className="text-sm text-gray-300">Current Phase:</div>
              <div className="text-lg font-bold text-blue-400">{currentPhase}</div>
            </div>
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

      {/* Features Grid */}
      <section className="container mx-auto px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="card text-center hover:bg-gray-700 transition-all duration-300">
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
              <p className="text-gray-400 text-sm">{feature.description}</p>
            </div>
          ))}
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