import React, { useState } from 'react';

const CommunityPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'forum' | 'clans' | 'events'>('forum');

  return (
    <div className="container mx-auto px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">Community</h1>
          <p className="text-gray-400">Connect with other players and join discussions</p>
        </div>
      </div>

      <div className="flex gap-2 mb-8 border-b border-gray-700">
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'forum' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('forum')}
        >
          💬 Forum
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'clans' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('clans')}
        >
          ⚔️ Clans
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'events' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('events')}
        >
          🎉 Events
        </button>
      </div>

      <div className="text-center text-gray-400 py-16">
        <div className="text-6xl mb-4">👥</div>
        <p className="text-lg">Community features will be implemented here</p>
        <p className="text-sm mt-2">This will include forums, clans, events, and social features</p>
      </div>
    </div>
  );
};

export default CommunityPage;