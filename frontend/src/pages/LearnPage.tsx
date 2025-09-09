import type React from 'react'
import { useState } from 'react'

const LearnPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tutorial' | 'rules' | 'strategies' | 'videos'>(
    'tutorial',
  )

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">Learn to Play</h1>
          <p className="text-muted">Master the art of strategic warfare</p>
        </div>
      </div>

      <div className="flex gap-2 mb-8 border-b border-border">
        <button
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'tutorial'
              ? 'text-violet-soft border-b-2 border-violet'
              : 'text-muted hover:text-white'
          }`}
          onClick={() => setActiveTab('tutorial')}
        >
          🎯 Tutorial
        </button>
        <button
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'rules'
              ? 'text-violet-soft border-b-2 border-violet'
              : 'text-muted hover:text-white'
          }`}
          onClick={() => setActiveTab('rules')}
        >
          📜 Rules
        </button>
        <button
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'strategies'
              ? 'text-violet-soft border-b-2 border-violet'
              : 'text-muted hover:text-white'
          }`}
          onClick={() => setActiveTab('strategies')}
        >
          🧠 Strategies
        </button>
        <button
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'videos'
              ? 'text-violet-soft border-b-2 border-violet'
              : 'text-muted hover:text-white'
          }`}
          onClick={() => setActiveTab('videos')}
        >
          📹 Videos
        </button>
      </div>

      <div className="text-center text-muted py-16">
        <div className="text-6xl mb-4">📚</div>
        <p className="text-lg">Learning resources will be implemented here</p>
        <p className="text-sm mt-2">
          This will include interactive tutorials, strategy guides, and video content
        </p>
      </div>
    </div>
  )
}

export default LearnPage
