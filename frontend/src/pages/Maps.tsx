import React, { useState } from 'react';
import { Link } from 'react-router-dom';
// import Breadcrumb from '../components/Breadcrumb';

const Maps: React.FC = () => {
  const [activeTab, setActiveTab] = useState('official');


  const tabs = [
    { id: 'official', label: 'Official Maps', icon: '🌎' },
    { id: 'featured', label: 'Featured', icon: '⭐' },
    { id: 'trending', label: 'Trending', icon: '🔥' },
    { id: 'recent', label: 'Recent', icon: '🆕' },
    { id: 'my-maps', label: 'My Maps', icon: '💝' }
  ];

  // Note: Mock maps removed - will be populated from backend when maps are implemented

  // Note: getRatingStars function removed - will be re-added when map ratings are implemented

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-4">🗺️ Maps Gallery</h1>
          <p className="text-gray-400 text-lg">Discover battlefields from around the world</p>
        </div>
        <Link
          to="/map-editor"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 rounded-lg font-medium text-white shadow-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 hover:scale-105"
        >
          ✏️ Create Map
        </Link>
      </div>

      {/* Search and Filter */}
      <div className="mb-8 flex items-center space-x-4">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search maps..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="absolute right-3 top-3 text-gray-400">🔍</div>
        </div>
        <select className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option>Sort by Popularity</option>
          <option>Sort by Rating</option>
          <option>Sort by Date</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="mb-8">
        <div className="flex space-x-1 bg-gray-800/50 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Coming Soon Content */}
      <div className="text-center py-20">
        <div className="max-w-2xl mx-auto">
          <div className="text-8xl mb-8">🗺️</div>
          <h2 className="text-3xl font-bold text-white mb-4">Maps Coming Soon</h2>
          <p className="text-gray-400 text-lg mb-8 leading-relaxed">
            We're working on building an amazing collection of strategic battlefields. 
            Soon you'll be able to play on classic maps, browse community creations, 
            and even build your own territories with our map editor.
          </p>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700/50">
            <h3 className="text-xl font-bold text-white mb-4">What's Coming:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <div>
                  <div className="font-semibold text-white">Classic Risk Maps</div>
                  <div className="text-gray-400 text-sm">World, Europe, Asia & more</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-400 mt-1">🚧</span>
                <div>
                  <div className="font-semibold text-white">Map Editor</div>
                  <div className="text-gray-400 text-sm">Create custom battlefields</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-400 mt-1">🚧</span>
                <div>
                  <div className="font-semibold text-white">Community Maps</div>
                  <div className="text-gray-400 text-sm">Share & discover creations</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-400 mt-1">🚧</span>
                <div>
                  <div className="font-semibold text-white">Map Ratings</div>
                  <div className="text-gray-400 text-sm">Community feedback system</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Maps;