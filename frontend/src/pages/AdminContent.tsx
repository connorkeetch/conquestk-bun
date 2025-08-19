import { useState, useEffect } from 'react'
import { adminService, ContentApprovalItem } from '../services/adminService'

interface ContentModal {
  item: ContentApprovalItem
  isOpen: boolean
  action: 'approve' | 'reject'
}

export default function AdminContent() {
  const [contentQueue, setContentQueue] = useState<ContentApprovalItem[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [limit] = useState(20)
  
  // Modal state
  const [actionModal, setActionModal] = useState<ContentModal | null>(null)
  const [actionNotes, setActionNotes] = useState('')

  useEffect(() => {
    loadContentQueue()
  }, [currentPage])

  const loadContentQueue = async () => {
    try {
      setLoading(true)
      setError(null)

      const offset = (currentPage - 1) * limit
      const result = await adminService.getContentApprovalQueue({
        limit,
        offset
      })

      setContentQueue(result.items)
      setTotalItems(result.total)
    } catch (err: any) {
      console.error('Error loading content queue:', err)
      setError(err.message || 'Failed to load content queue')
    } finally {
      setLoading(false)
    }
  }

  const handleContentAction = async () => {
    if (!actionModal) return

    try {
      if (actionModal.action === 'approve') {
        await adminService.approveContent(actionModal.item.id, actionNotes)
      } else {
        if (!actionNotes.trim()) {
          alert('Please provide a reason for rejection')
          return
        }
        await adminService.rejectContent(actionModal.item.id, actionNotes)
      }

      await loadContentQueue()
      setActionModal(null)
      setActionNotes('')
    } catch (err: any) {
      console.error('Error processing content action:', err)
      alert(`Failed to ${actionModal.action} content: ${err.message}`)
    }
  }

  const openActionModal = (item: ContentApprovalItem, action: 'approve' | 'reject') => {
    setActionModal({ item, isOpen: true, action })
    setActionNotes('')
  }

  const closeActionModal = () => {
    setActionModal(null)
    setActionNotes('')
  }

  const totalPages = Math.ceil(totalItems / limit)

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">🔍 Content Moderation</h1>
            <div className="text-gray-400">
              Review and moderate user-generated content
            </div>
          </div>
          <a 
            href="/admin"
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
          >
            ← Back to Dashboard
          </a>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-yellow-400">
                  {totalItems.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Pending Reviews</div>
              </div>
              <div className="text-3xl">⏳</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-400">
                  {contentQueue.filter(item => item.contentType === 'map').length}
                </div>
                <div className="text-sm text-gray-400">Maps to Review</div>
              </div>
              <div className="text-3xl">🗺️</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-400">
                  {contentQueue.filter(item => item.contentType !== 'map').length}
                </div>
                <div className="text-sm text-gray-400">Other Content</div>
              </div>
              <div className="text-3xl">📝</div>
            </div>
          </div>
        </div>

        {/* Content Queue */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-700">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Approval Queue</h2>
              <button
                onClick={loadContentQueue}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="text-2xl mb-4">⏳</div>
              <div>Loading content queue...</div>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <div className="text-2xl mb-4 text-red-400">❌</div>
              <div className="text-red-400 mb-4">{error}</div>
              <button 
                onClick={loadContentQueue}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
              >
                Retry
              </button>
            </div>
          ) : contentQueue.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-2xl mb-4">🎉</div>
              <div className="text-lg font-medium mb-2">All caught up!</div>
              <div className="text-gray-400">No content pending review</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {contentQueue.map((item) => (
                <div key={item.id} className="p-6 hover:bg-gray-750">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <span className="text-2xl">
                          {adminService.formatContentType(item.contentType)}
                        </span>
                        <div>
                          <div className="font-medium text-lg">
                            {item.contentName || 'Unnamed Content'}
                          </div>
                          <div className="text-sm text-gray-400">
                            by {item.submitterUsername} • {new Date(item.submittedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-gray-400">Content Type</div>
                          <div className="capitalize">{item.contentType}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Submitted</div>
                          <div>{new Date(item.submittedAt).toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Submitter</div>
                          <div>{item.submitterUsername}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Status</div>
                          <div className="capitalize text-yellow-400">{item.status}</div>
                        </div>
                      </div>

                      {/* Preview for maps */}
                      {item.contentType === 'map' && (
                        <div className="mt-4 p-4 bg-gray-700 rounded-lg">
                          <div className="text-sm text-gray-400 mb-2">Map Preview</div>
                          <div className="text-sm">
                            <div><strong>Map ID:</strong> {item.contentId}</div>
                            <div><strong>Name:</strong> {item.contentName || 'Unnamed Map'}</div>
                            <a 
                              href={`/map-editor?id=${item.contentId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >
                              View in Map Editor →
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex space-x-2 ml-6">
                      <button
                        onClick={() => openActionModal(item, 'approve')}
                        className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm font-medium"
                      >
                        ✅ Approve
                      </button>
                      <button
                        onClick={() => openActionModal(item, 'reject')}
                        className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm font-medium"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-700">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-400">
                  Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, totalItems)} of {totalItems} items
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              {actionModal.action === 'approve' ? '✅ Approve Content' : '❌ Reject Content'}
            </h3>
            
            <div className="mb-4 p-4 bg-gray-700 rounded">
              <div className="font-medium">{actionModal.item.contentName || 'Unnamed Content'}</div>
              <div className="text-sm text-gray-400">
                {adminService.formatContentType(actionModal.item.contentType)} by {actionModal.item.submitterUsername}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  {actionModal.action === 'approve' ? 'Notes (optional)' : 'Reason for rejection (required)'}
                </label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded resize-none"
                  rows={4}
                  placeholder={
                    actionModal.action === 'approve' 
                      ? 'Optional notes about the approval...'
                      : 'Please explain why this content is being rejected...'
                  }
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={closeActionModal}
                className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleContentAction}
                disabled={actionModal.action === 'reject' && !actionNotes.trim()}
                className={`px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed ${
                  actionModal.action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionModal.action === 'approve' ? '✅ Approve' : '❌ Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}