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
          className={`px-6 py-3 font-medium transition-colors cursor-not-allowed ${
            activeTab === 'forum' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-500'
          }`}
          disabled
        >
          💬 Forum
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors cursor-not-allowed ${
            activeTab === 'clans' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-500'
          }`}
          disabled
        >
          ⚔️ Clans
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors cursor-not-allowed ${
            activeTab === 'events' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-500'
          }`}
          disabled
        >
          🎉 Events
        </button>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700 text-center">
        <div className="text-6xl mb-4">👥</div>
        <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4 mb-4">
          <span className="bg-yellow-600/80 text-yellow-100 px-3 py-1 rounded-full text-sm font-medium">Coming Soon</span>
        </div>
        <p className="text-lg text-gray-300 mb-2">Community features will be implemented here</p>
        <p className="text-sm text-gray-400">This will include forums, clans, events, and social features</p>
      </div>
    </div>
  );
};

export default CommunityPage;