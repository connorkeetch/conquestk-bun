import React, { useState } from 'react';

const LearnPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tutorial' | 'rules' | 'strategies' | 'videos'>('tutorial');

  return (
    <div className="container mx-auto px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">Learn to Play</h1>
          <p className="text-gray-400">Master the art of strategic warfare</p>
        </div>
      </div>

      <div className="flex gap-2 mb-8 border-b border-gray-700">
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'tutorial' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('tutorial')}
        >
          🎯 Tutorial
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'rules' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('rules')}
        >
          📜 Rules
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'strategies' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('strategies')}
        >
          🧠 Strategies
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'videos' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('videos')}
        >
          📹 Videos
        </button>
      </div>

      <div className="text-center text-gray-400 py-16">
        <div className="text-6xl mb-4">📚</div>
        <p className="text-lg">Learning resources will be implemented here</p>
        <p className="text-sm mt-2">This will include interactive tutorials, strategy guides, and video content</p>
      </div>
    </div>
  );
};

export default LearnPage;