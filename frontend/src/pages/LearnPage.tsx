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

      <div className="tabs mb-8">
        <button
          type="button"
          className={`tab ${activeTab === 'tutorial' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('tutorial')}
        >
          🎯 Tutorial
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'rules' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          📜 Rules
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'strategies' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('strategies')}
        >
          🧠 Strategies
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'videos' ? 'tab-active' : ''}`}
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
