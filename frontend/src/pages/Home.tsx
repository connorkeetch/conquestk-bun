import React from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';

interface Feature {
  icon: string;
  title: string;
  description: string;
  status: 'available' | 'coming-soon';
}

const Home: React.FC = () => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  const features: Feature[] = [
    {
      icon: '⚔️',
      title: 'Strategic Battles',
      description: 'Authentic dice mechanics with tactical combat',
      status: 'available'
    },
    {
      icon: '🎨',
      title: 'Map Editor',
      description: 'Design custom battlefields with advanced tools',
      status: 'available'
    },
    {
      icon: '👥',
      title: 'Multiplayer Wars',
      description: 'Epic battles with up to 6 commanders',
      status: 'coming-soon'
    },
    {
      icon: '🏆',
      title: 'Tournaments',
      description: 'Ranked seasons and competitive events',
      status: 'coming-soon'
    }
  ];


  return (
    <div className="min-h-screen">
      {/* Optimized Hero Section - Reduced Height */}
      <section className="relative overflow-hidden py-20 lg:py-32">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-purple-900/20 to-black/50"></div>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px'
          }}></div>
        </div>
        
        {/* Constrained Content Container */}
        <div className="relative container mx-auto px-6 max-w-6xl text-center">
          {/* Beta Badge */}
          <div className="inline-flex items-center gap-3 bg-gray-800/50 backdrop-blur-sm rounded-full px-4 py-2 border border-gray-700/50 mb-8">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-green-400 font-semibold text-sm">Beta Testing</span>
          </div>

          {/* Powerful, Concise Hero Title */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Strategic Warfare
            </span>
            <br />
            <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
              Redefined
            </span>
          </h1>
          
          {/* Clear Value Proposition */}
          <p className="text-xl md:text-2xl text-gray-200 mb-8 max-w-4xl mx-auto leading-relaxed">
            Command armies. Conquer territories. Dominate the battlefield.
            <br className="hidden md:block" />
            <span className="text-blue-400 font-semibold">The ultimate multiplayer Risk experience.</span>
          </p>

          {/* Primary Action */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            {isAuthenticated ? (
              <>
                <Link 
                  to="/lobby" 
                  className="group relative px-8 py-4 text-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transform hover:scale-105 transition-all duration-200"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    ⚡ Start Playing
                  </span>
                </Link>
                <Link 
                  to="/map-editor" 
                  className="px-8 py-4 text-lg bg-gray-800/50 backdrop-blur-sm border-2 border-gray-600 hover:border-blue-500 text-white font-semibold rounded-xl transform hover:scale-105 transition-all duration-200"
                >
                  🎨 Map Editor
                </Link>
              </>
            ) : (
              <>
                <Link 
                  to="/register" 
                  className="group relative px-8 py-4 text-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transform hover:scale-105 transition-all duration-200 overflow-hidden"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    ⚔️ Join the War
                    <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                </Link>
                <Link 
                  to="/login" 
                  className="px-8 py-4 text-lg bg-gray-800/50 backdrop-blur-sm border-2 border-gray-600 hover:border-blue-500 text-white font-semibold rounded-xl transform hover:scale-105 transition-all duration-200"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
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

      {/* Features Section - Focused & Visual */}
      <section className="py-20 bg-gray-900/20">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="gradient-text">What Makes Us Different</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Cutting-edge features that bring strategic warfare into the modern age
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="group relative bg-gray-800/30 backdrop-blur-sm rounded-2xl p-8 border border-gray-700/50 hover:border-blue-500/50 transition-all duration-300 hover:transform hover:scale-102 hover:shadow-xl hover:shadow-blue-600/10"
              >
                {feature.status === 'coming-soon' && (
                  <div className="absolute top-4 right-4 px-3 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full text-orange-400 text-xs font-semibold">
                    Coming Soon
                  </div>
                )}
                
                <div className="flex items-start gap-6">
                  <div className="text-4xl group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-3 group-hover:text-blue-400 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-gray-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Beta Status */}
      <section className="py-20">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="bg-gradient-to-r from-gray-800/40 via-gray-900/40 to-gray-800/40 backdrop-blur-sm rounded-2xl p-12 border border-gray-700/50 text-center">
            <h2 className="text-3xl font-bold mb-4">
              <span className="gradient-text">Join the Beta</span>
            </h2>
            <p className="text-gray-300 text-lg mb-8 max-w-2xl mx-auto">
              Be among the first commanders to experience next-generation strategic warfare. 
              Shape the future of multiplayer Risk gaming.
            </p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
              <div className="group">
                <div className="text-2xl font-bold text-blue-400 mb-1 group-hover:scale-110 transition-transform">
                  ⚡
                </div>
                <div className="text-sm text-gray-400">Real-time Battles</div>
              </div>
              <div className="group">
                <div className="text-2xl font-bold text-green-400 mb-1 group-hover:scale-110 transition-transform">
                  🎨
                </div>
                <div className="text-sm text-gray-400">Map Editor</div>
              </div>
              <div className="group">
                <div className="text-2xl font-bold text-purple-400 mb-1 group-hover:scale-110 transition-transform">
                  🛡️
                </div>
                <div className="text-sm text-gray-400">Secure Play</div>
              </div>
              <div className="group">
                <div className="text-2xl font-bold text-orange-400 mb-1 group-hover:scale-110 transition-transform">
                  🚀
                </div>
                <div className="text-sm text-gray-400">Regular Updates</div>
              </div>
            </div>

            {!isAuthenticated && (
              <Link 
                to="/register" 
                className="inline-flex items-center gap-3 px-8 py-4 text-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transform hover:scale-105 transition-all duration-200"
              >
                🎮 Start Your Campaign
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* How It Works - Streamlined */}
      <section className="py-20 bg-gray-900/10">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="gradient-text">How to Dominate</span>
            </h2>
            <p className="text-gray-400 text-lg">
              Master these three fundamentals to become a legendary commander
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-blue-600/25">
                1
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Deploy Strategically</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Position your forces across key territories and chokepoints
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-purple-600/25">
                2
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Attack & Defend</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Time your strikes and fortify vulnerable positions
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-green-600 to-green-700 rounded-xl flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-green-600/25">
                3
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Claim Victory</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Adapt your strategy and conquer the world
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;