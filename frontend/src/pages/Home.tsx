import React from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

const Home: React.FC = () => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  // Note: Mock data removed - real game rooms will be loaded from backend when multiplayer is ready

  const features: Feature[] = [
    {
      icon: '⚔️',
      title: 'Real-time Battles',
      description: 'Authentic dice mechanics with smooth animations and strategic combat'
    },
    {
      icon: '🗺️',
      title: 'Multiple Maps',
      description: 'Classic world map plus custom creations from our community'
    },
    {
      icon: '👥',
      title: '6 Player Support',
      description: 'Epic multiplayer battles with up to 6 simultaneous commanders'
    },
    {
      icon: '🎨',
      title: 'Custom Maps',
      description: 'Create your own battlefields with our advanced map editor'
    },
    {
      icon: '🏆',
      title: 'Tournaments',
      description: 'Compete in ranked seasons and special events for glory'
    },
    {
      icon: '⚡',
      title: 'Fast Games',
      description: 'Quick matches and blitz modes for strategic battles on-the-go'
    }
  ];


  return (
    <div className="min-h-screen">
      {/* Enhanced Hero Section */}
      <section className="relative overflow-hidden min-h-screen flex items-center">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-purple-900/20 to-black/50"></div>
        <div className="absolute inset-0 opacity-10">
          {/* Subtle grid pattern */}
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px'
          }}></div>
        </div>
        
        {/* Main Hero Content */}
        <div className="relative container mx-auto px-8 text-center">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-3 bg-gray-800/50 backdrop-blur-sm rounded-full px-6 py-3 border border-gray-700/50 mb-8">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-green-400 font-semibold text-sm">Beta</span>
            <span className="text-gray-400 text-sm">• Strategic multiplayer warfare</span>
          </div>

          {/* Hero Title */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-green-400 bg-clip-text text-transparent">
              Conquer the
            </span>
            <br />
            <span className="bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
              World
            </span>
          </h1>
          
          {/* Enhanced Tagline */}
          <p className="text-xl md:text-2xl text-gray-200 mb-12 max-w-3xl mx-auto leading-relaxed">
            Command armies. <span className="text-blue-400 font-semibold">Forge alliances.</span> Dominate territories.
            <br className="hidden md:block" />
            The ultimate strategic multiplayer warfare experience.
          </p>
          
          {/* Enhanced CTAs */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            {isAuthenticated ? (
              <>
                <Link 
                  to="/lobby" 
                  className="group relative px-8 py-4 text-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transform hover:scale-105 transition-all duration-200 overflow-hidden"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    ⚡ Quick Match
                    <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                </Link>
                <Link 
                  to="/lobby" 
                  className="px-8 py-4 text-lg bg-gray-800/50 backdrop-blur-sm border-2 border-gray-600 hover:border-blue-500 text-white font-bold rounded-xl transform hover:scale-105 transition-all duration-200"
                >
                  🎮 Create Private Game
                </Link>
              </>
            ) : (
              <>
                <Link 
                  to="/register" 
                  className="group relative px-8 py-4 text-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transform hover:scale-105 transition-all duration-200 overflow-hidden"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    ⚡ Join the Battle
                    <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                </Link>
                <Link 
                  to="/login" 
                  className="px-8 py-4 text-lg bg-gray-800/50 backdrop-blur-sm border-2 border-gray-600 hover:border-blue-500 text-white font-bold rounded-xl transform hover:scale-105 transition-all duration-200"
                >
                  🔑 Sign In
                </Link>
              </>
            )}
          </div>

          {/* Quick Preview Text */}
          <div className="mt-12 text-gray-400 text-sm">
            <p>Free to play • No downloads required • Cross-platform</p>
          </div>
        </div>
      </section>


      {/* Live Games Coming Soon Section */}
      <section className="container mx-auto px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="gradient-text">Live Battles</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Real-time multiplayer games are coming soon
          </p>
        </div>
        
        <div className="max-w-2xl mx-auto">
          <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl p-12 border border-gray-700/50 text-center">
            <div className="text-6xl mb-6">🚧</div>
            <h3 className="text-2xl font-bold text-white mb-4">Coming Soon</h3>
            <p className="text-gray-400 mb-8 leading-relaxed">
              We're building the multiplayer lobby system where you'll be able to join live battles, 
              create private rooms, and compete with players worldwide. Stay tuned!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                to={isAuthenticated ? "/lobby" : "/register"} 
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                {isAuthenticated ? "Try Beta Features" : "Join the Beta"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Enhanced Features Section - Visual Cards */}
      <section className="container mx-auto px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="gradient-text">Epic Strategic Warfare</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-3xl mx-auto">
            Experience the ultimate in strategic gaming with cutting-edge features designed for modern commanders
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <div 
              key={index} 
              className="group bg-gray-800/30 backdrop-blur-sm rounded-2xl p-8 border border-gray-700/50 hover:border-blue-500/50 transition-all duration-300 hover:transform hover:scale-105 hover:shadow-xl hover:shadow-blue-600/20"
            >
              <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-4 group-hover:text-blue-400 transition-colors">
                {feature.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Beta Features Section */}
      <section className="container mx-auto px-8 py-20">
        <div className="bg-gradient-to-r from-gray-800/40 via-gray-900/40 to-gray-800/40 backdrop-blur-sm rounded-2xl p-12 border border-gray-700/50">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="gradient-text">Beta Testing Now</span>
            </h2>
            <p className="text-gray-400 text-lg">
              Help us build the ultimate strategic warfare experience
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
            <div className="group">
              <div className="text-3xl md:text-4xl font-bold text-blue-400 mb-2 group-hover:scale-110 transition-transform">
                ⚡
              </div>
              <div className="text-gray-400 font-medium">Fast Development</div>
            </div>
            <div className="group">
              <div className="text-3xl md:text-4xl font-bold text-green-400 mb-2 group-hover:scale-110 transition-transform">
                🛡️
              </div>
              <div className="text-gray-400 font-medium">Secure & Stable</div>
            </div>
            <div className="group">
              <div className="text-3xl md:text-4xl font-bold text-yellow-400 mb-2 group-hover:scale-110 transition-transform">
                🎯
              </div>
              <div className="text-gray-400 font-medium">Strategic Focus</div>
            </div>
            <div className="group">
              <div className="text-3xl md:text-4xl font-bold text-purple-400 mb-2 group-hover:scale-110 transition-transform">
                🚀
              </div>
              <div className="text-gray-400 font-medium">Always Improving</div>
            </div>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      {!isAuthenticated && (
        <section className="container mx-auto px-8 py-20">
          <div className="bg-gradient-to-r from-blue-900/20 via-purple-900/30 to-blue-900/20 backdrop-blur-sm rounded-2xl p-16 border border-gray-700/50 text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              <span className="gradient-text">Ready to Begin Your Conquest?</span>
            </h2>
            <p className="text-xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">
              Join thousands of strategic commanders in the ultimate battle for world domination. 
              Every victory brings glory, every defeat brings wisdom.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Link 
                to="/register" 
                className="group relative px-10 py-4 text-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transform hover:scale-105 transition-all duration-200 overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center gap-3">
                  ⚔️ Create Account
                  <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              </Link>
              
              <Link 
                to="/login" 
                className="px-10 py-4 text-xl bg-gray-800/50 backdrop-blur-sm border-2 border-gray-600 hover:border-blue-500 text-white font-bold rounded-xl transform hover:scale-105 transition-all duration-200"
              >
                🔑 Sign In
              </Link>
            </div>

            <div className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Free to play
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                No downloads
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Cross-platform
              </div>
            </div>
          </div>
        </section>
      )}

      {/* How It Works Section */}
      <section className="container mx-auto px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="gradient-text">Master the Art of War</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Simple to learn, impossible to master. Follow these steps to begin your journey.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-blue-600/25">
              1
            </div>
            <h3 className="text-xl font-bold text-white mb-4">Choose Your Battlefield</h3>
            <p className="text-gray-400 leading-relaxed">
              Select from classic maps or explore community-created territories. Each map offers unique strategic challenges.
            </p>
          </div>

          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-purple-600/25">
              2
            </div>
            <h3 className="text-xl font-bold text-white mb-4">Deploy Your Forces</h3>
            <p className="text-gray-400 leading-relaxed">
              Strategically place your armies across territories. Every placement decision shapes your path to victory.
            </p>
          </div>

          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-green-600 to-green-700 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-green-600/25">
              3
            </div>
            <h3 className="text-xl font-bold text-white mb-4">Conquer & Dominate</h3>
            <p className="text-gray-400 leading-relaxed">
              Launch attacks, forge alliances, and adapt your strategy. Only the most cunning commanders will prevail.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;