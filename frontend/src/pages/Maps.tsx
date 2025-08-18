import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumb from '../components/navigation/Breadcrumb';

const Maps: React.FC = () => {
  const [activeTab, setActiveTab] = useState('official');

  const breadcrumbItems = [
    { label: 'Dashboard', link: '/dashboard', icon: '🏠' },
    { label: 'Maps', icon: '🗺️' }
  ];

  const tabs = [
    { id: 'official', label: 'Official Maps', icon: '🌎' },
    { id: 'featured', label: 'Featured', icon: '⭐' },
    { id: 'trending', label: 'Trending', icon: '🔥' },
    { id: 'recent', label: 'Recent', icon: '🆕' },
    { id: 'my-maps', label: 'My Maps', icon: '💝' }
  ];

  const officialMaps = [
    {
      id: '1',
      name: 'Classic World',
      description: 'The original Risk world map with 42 territories',
      territories: 42,
      rating: 4.9,
      games: 1234,
      thumbnail: '🌍'
    },
    {
      id: '2',
      name: 'Europe',
      description: 'Strategic battles across European nations',
      territories: 32,
      rating: 4.7,
      games: 892,
      thumbnail: '🏰'
    },
    {
      id: '3',
      name: 'Asia',
      description: 'Conquer the vast Asian continent',
      territories: 28,
      rating: 4.6,
      games: 667,
      thumbnail: '🏯'
    },
    {
      id: '4',
      name: 'Americas',
      description: 'From Alaska to Argentina',
      territories: 30,
      rating: 4.8,
      games: 445,
      thumbnail: '🗽'
    }
  ];

  const getRatingStars = (rating: number) => {
    const stars = Math.floor(rating);
    return '⭐'.repeat(stars) + (rating % 1 >= 0.5 ? '⭐' : '');
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} className="mb-6" />

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-4">🗺️ Maps Gallery</h1>
          <p className="text-gray-400 text-lg">Discover battlefields from around the world</p>
        </div>
        <Link
          to="/map-editor"
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-6 py-3 rounded-lg font-medium transition-all duration-200 text-white shadow-lg hover:shadow-xl"
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

      {/* Maps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {officialMaps.map((map) => (
          <Link
            key={map.id}
            to={`/maps/${map.id}`}
            className="group bg-gray-800/50 backdrop-blur-sm rounded-xl overflow-hidden border border-gray-700 hover:border-blue-500 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-2xl"
          >
            {/* Map Thumbnail */}
            <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-6xl group-hover:scale-110 transition-transform duration-300">
              {map.thumbnail}
            </div>

            {/* Map Info */}
            <div className="p-4">
              <h3 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
                {map.name}
              </h3>
              <p className="text-gray-400 text-sm mb-3 line-clamp-2">{map.description}</p>
              
              {/* Stats */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Territories</span>
                  <span className="text-white font-medium">{map.territories}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Rating</span>
                  <div className="flex items-center space-x-1">
                    <span className="text-yellow-400 text-xs">{getRatingStars(map.rating)}</span>
                    <span className="text-white font-medium">{map.rating}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Games Played</span>
                  <span className="text-green-400 font-medium">{map.games}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Load More */}
      <div className="mt-12 text-center">
        <button className="bg-gray-800 hover:bg-gray-700 px-8 py-3 rounded-lg font-medium transition-all duration-200 text-white border border-gray-600">
          Load More Maps
        </button>
      </div>
    </div>
  );
};

export default Maps;