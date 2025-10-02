import { X } from 'lucide-react'
import { useState } from 'react'

interface TermsSection {
  title: string
  items: string[]
}

interface TermsContent {
  title: string
  version: string
  sections: TermsSection[]
}

interface TermsModalProps {
  isOpen: boolean
  onAccept: () => void
  onDecline?: () => void
  termsContent: TermsContent
  featureType: string
}

export default function TermsModal({
  isOpen,
  onAccept,
  onDecline,
  termsContent,
  featureType,
}: TermsModalProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [isAcceptChecked, setIsAcceptChecked] = useState(false)

  if (!isOpen) return null

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10
    if (isAtBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true)
    }
  }

  const handleAccept = () => {
    if (!isAcceptChecked) {
      alert('Please check the acceptance box to continue')
      return
    }
    onAccept()
  }

  const handleDecline = () => {
    if (onDecline) {
      onDecline()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{termsContent.title}</h2>
            <p className="text-sm text-muted">Version {termsContent.version}</p>
          </div>
          {onDecline && (
            <button
              type="button"
              onClick={handleDecline}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-gray-200 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4" onScroll={handleScroll}>
          <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
            <p className="text-sm font-medium text-yellow-800">
              Please read these terms carefully before using the {featureType.replace('_', ' ')}.
            </p>
          </div>

          {termsContent.sections.map((section, sectionIndex) => (
            <div key={`${section.title}-${sectionIndex}`} className="mb-6">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">{section.title}</h3>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={`${section.title}-${item}`} className="flex items-start">
                    <span className="mr-2 mt-1 block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400" />
                    <span className="text-sm text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {!hasScrolledToBottom && (
            <div className="mt-4 text-center">
              <p className="text-sm font-medium text-muted">
                ↓ Please scroll down to read all terms ↓
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="mb-4">
            <label className="flex items-start">
              <input
                type="checkbox"
                checked={isAcceptChecked}
                onChange={(e) => setIsAcceptChecked(e.target.checked)}
                disabled={!hasScrolledToBottom}
                className="mr-3 mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-primary disabled:opacity-50"
              />
              <span className={`text-sm ${!hasScrolledToBottom ? 'text-muted' : 'text-gray-700'}`}>
                I have read and agree to the {termsContent.title}. I understand that:
                <ul className="mt-1 ml-4 text-xs">
                  <li>• I will not upload copyrighted material</li>
                  <li>• My content may be reviewed and moderated</li>
                  <li>• Violations may result in account restrictions</li>
                </ul>
              </span>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleAccept}
              disabled={!isAcceptChecked || !hasScrolledToBottom}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              I Accept the Terms
            </button>
            {onDecline && (
              <button
                type="button"
                onClick={handleDecline}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Decline and Go Back
              </button>
            )}
          </div>

          {!hasScrolledToBottom && (
            <p className="mt-2 text-center text-xs text-muted">
              You must read all terms before accepting
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
