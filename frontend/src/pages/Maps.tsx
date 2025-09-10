import type React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GRADIENTS, CORE_COLORS } from '../constants/colors'

// import Breadcrumb from '../components/Breadcrumb';

const Maps: React.FC = () => {
  const [activeTab, setActiveTab] = useState('official')

  const tabs = [
    { id: 'official', label: 'Official Maps', icon: '🌎' },
    { id: 'featured', label: 'Featured', icon: '⭐' },
    { id: 'trending', label: 'Trending', icon: '🔥' },
    { id: 'recent', label: 'Recent', icon: '🆕' },
    { id: 'my-maps', label: 'My Maps', icon: '💝' },
  ]

  // Note: Mock maps removed - will be populated from backend when maps are implemented

  // Note: getRatingStars function removed - will be re-added when map ratings are implemented

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-primary-soft">Maps Gallery</h1>
          <p className="text-muted text-lg">Discover battlefields from around the world</p>
        </div>
        <Link
          to="/map-editor"
          className="btn-primary hover-lift hover-glow"
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
            className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-white placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="absolute right-3 top-3 text-muted">🔍</div>
        </div>
        <select className="bg-surface-2 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary">
          <option>Sort by Popularity</option>
          <option>Sort by Rating</option>
          <option>Sort by Date</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="mb-8">
        <div className="flex space-x-1 bg-surface-2/50 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-lg'
                  : 'text-muted hover:text-white hover:bg-surface-2'
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
          <p className="text-muted text-lg mb-8 leading-relaxed">
            We're working on building an amazing collection of strategic battlefields. Soon you'll
            be able to play on classic maps, browse community creations, and even build your own
            territories with our map editor.
          </p>
          <div className="box1 p-8">
            <h3 className="text-xl font-bold text-white mb-4">What's Coming:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <div className="flex items-start gap-3">
                <span className="text-success mt-1">✓</span>
                <div>
                  <div className="font-semibold text-white">Classic Risk Maps</div>
                  <div className="text-muted text-sm">World, Europe, Asia & more</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary-soft mt-1">🚧</span>
                <div>
                  <div className="font-semibold text-white">Map Editor</div>
                  <div className="text-muted text-sm">Create custom battlefields</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary-soft mt-1">🚧</span>
                <div>
                  <div className="font-semibold text-white">Community Maps</div>
                  <div className="text-muted text-sm">Share & discover creations</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary-soft mt-1">🚧</span>
                <div>
                  <div className="font-semibold text-white">Map Ratings</div>
                  <div className="text-muted text-sm">Community feedback system</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Maps
