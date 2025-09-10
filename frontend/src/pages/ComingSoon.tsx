import type React from 'react'
import { Link } from 'react-router-dom'

interface ComingSoonProps {
  title: string
  description: string
  icon: string
  features?: string[]
}

const ComingSoon: React.FC<ComingSoonProps> = ({ title, description, icon, features = [] }) => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-12 border border-slate-700 text-center">
        {/* Icon */}
        <div className="text-8xl mb-6">{icon}</div>

        {/* Coming Soon Badge */}
        <div className="mb-6">
          <span className="bg-yellow-600/80 text-yellow-100 px-4 py-2 rounded-full text-lg font-medium">
            Coming Soon
          </span>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-white mb-4">{title}</h1>

        {/* Description */}
        <p className="text-xl text-muted mb-8 max-w-2xl mx-auto">{description}</p>

        {/* Features List */}
        {features.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Planned Features:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center text-muted">
                  <span className="text-green-400 mr-2">✓</span>
                  {feature}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-slate-700/30 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-white mb-2">Development Status</h3>
          <p className="text-muted text-sm">
            We're focusing on perfecting the core game experience first. This feature will be
            implemented in a future update once the main gameplay is fully polished.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/dashboard"
            className="bg-primary hover:bg-primary text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            🏠 Back to Dashboard
          </Link>
          <Link
            to="/game"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            🎮 Play Game Instead
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-slate-600">
          <p className="text-muted text-sm">
            Want to be notified when this feature launches?
            <Link to="/settings" className="text-primary-soft hover:text-primary-soft ml-1">
              Check your notification settings
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ComingSoon
