import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { AdminPageHeader } from '../components/admin/AdminPageHeader'
import { adminService, type ContentApprovalItem } from '../services/adminService'

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
  const limit = 20

  // Modal state
  const [actionModal, setActionModal] = useState<ContentModal | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [submittingAction, setSubmittingAction] = useState(false)

  const loadContentQueue = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const offset = (currentPage - 1) * limit
      const result = await adminService.getContentApprovalQueue({
        limit,
        offset,
      })

      setContentQueue(result.items)
      setTotalItems(result.total)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load content queue'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [currentPage])

  useEffect(() => {
    void loadContentQueue()
  }, [loadContentQueue])

  const handleContentAction = async () => {
    if (!actionModal) return

    setSubmittingAction(true)
    setActionError(null)

    if (actionModal.action === 'reject' && !actionNotes.trim()) {
      setActionError('Please provide a reason for rejection')
      setSubmittingAction(false)
      return
    }

    try {
      if (actionModal.action === 'approve') {
        await adminService.approveContent(actionModal.item.id, actionNotes)
        toast.success('Content approved')
      } else {
        await adminService.rejectContent(actionModal.item.id, actionNotes)
        toast.success('Content rejected')
      }

      await loadContentQueue()
      setActionModal(null)
      setActionNotes('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `Failed to ${actionModal.action} content`
      setActionError(message)
      toast.error(message)
    } finally {
      setSubmittingAction(false)
    }
  }

  const openActionModal = (item: ContentApprovalItem, action: 'approve' | 'reject') => {
    setActionModal({ item, isOpen: true, action })
    setActionNotes('')
    setActionError(null)
  }

  const closeActionModal = () => {
    setActionModal(null)
    setActionNotes('')
    setActionError(null)
    setSubmittingAction(false)
  }

  const totalPages = Math.ceil(totalItems / limit)
  const notesFieldId = actionModal
    ? `content-action-notes-${actionModal.item.id}`
    : 'content-action-notes'

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="space-y-8">
        <AdminPageHeader
          title="Content Moderation"
          subtitle="Review submissions and keep the community healthy"
          icon="🔍"
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="panel">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold text-[color:var(--color-warning)]">
                  {totalItems.toLocaleString()}
                </div>
                <p className="text-sm text-muted mt-1">Pending reviews</p>
              </div>
              <div className="text-3xl">⏳</div>
            </div>
          </div>

          <div className="panel">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold text-[color:var(--color-primary)]">
                  {contentQueue.filter((item) => item.contentType === 'map').length}
                </div>
                <p className="text-sm text-muted mt-1">Maps to review</p>
              </div>
              <div className="text-3xl">🗺️</div>
            </div>
          </div>

          <div className="panel">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold text-[color:var(--color-success)]">
                  {contentQueue.filter((item) => item.contentType !== 'map').length}
                </div>
                <p className="text-sm text-muted mt-1">Other content</p>
              </div>
              <div className="text-3xl">📝</div>
            </div>
          </div>
        </div>

        {/* Content Queue */}
        <div className="panel p-0 overflow-hidden">
          <div className="border-b border-[color:var(--panel-border)] px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[color:var(--heading)]">Approval queue</h2>
              <button
                type="button"
                onClick={() => void loadContentQueue()}
                className="btn-primary btn-sm"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center space-y-2">
              <div className="text-2xl">⏳</div>
              <p className="text-sm text-muted">Loading content queue...</p>
            </div>
          ) : error ? (
            <div className="px-6 py-12 text-center space-y-3">
              <div className="text-2xl text-[color:var(--color-danger)]">❌</div>
              <p className="text-sm text-[color:var(--color-danger)]">{error}</p>
              <button
                type="button"
                onClick={() => void loadContentQueue()}
                className="btn-primary btn-sm"
              >
                Retry
              </button>
            </div>
          ) : contentQueue.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <div className="text-2xl">🎉</div>
              <p className="text-lg font-medium text-[color:var(--heading)]">All caught up!</p>
              <p className="text-sm text-muted">No content pending review</p>
            </div>
          ) : (
            <div className="divide-y divide-[color:var(--panel-border)]">
              {contentQueue.map((item) => (
                <div
                  key={item.id}
                  className="px-6 py-5 transition-colors hover:bg-[color:var(--hover-bg)]"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                    <div className="flex-1 space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                        <span className="text-2xl">
                          {adminService.formatContentType(item.contentType)}
                        </span>
                        <div>
                          <div className="text-lg font-semibold text-[color:var(--heading)]">
                            {item.contentName || 'Unnamed content'}
                          </div>
                          <p className="text-sm text-muted">
                            by {item.submitterUsername} •{' '}
                            {new Date(item.submittedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-muted">Content type</p>
                          <p className="capitalize text-[color:var(--text)]">{item.contentType}</p>
                        </div>
                        <div>
                          <p className="text-muted">Submitted</p>
                          <p className="text-[color:var(--text)]">
                            {new Date(item.submittedAt).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted">Submitter</p>
                          <p className="text-[color:var(--text)]">{item.submitterUsername}</p>
                        </div>
                        <div>
                          <p className="text-muted">Status</p>
                          <p className="capitalize text-[color:var(--color-warning)]">
                            {item.status}
                          </p>
                        </div>
                      </div>

                      {item.contentType === 'map' && (
                        <div className="panel-muted space-y-2">
                          <p className="text-sm text-muted">Map preview</p>
                          <div className="space-y-1 text-sm text-[color:var(--text)]">
                            <div>
                              <strong>Map ID:</strong> {item.contentId}
                            </div>
                            <div>
                              <strong>Name:</strong> {item.contentName || 'Unnamed map'}
                            </div>
                            <a
                              href={`/map-editor?id=${item.contentId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[color:var(--color-primary)] hover:underline"
                            >
                              View in map editor →
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 lg:flex-col lg:items-end lg:gap-2">
                      <button
                        type="button"
                        onClick={() => openActionModal(item, 'approve')}
                        className="btn-success btn-sm"
                      >
                        ✅ Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => openActionModal(item, 'reject')}
                        className="btn-danger btn-sm"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="border-t border-[color:var(--panel-border)] px-6 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted">
                  Showing {(currentPage - 1) * limit + 1} to{' '}
                  {Math.min(currentPage * limit, totalItems)} of {totalItems} items
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="btn-secondary btn-sm"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-[color:var(--text)]">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="btn-secondary btn-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Modal */}
        {actionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="modal w-full max-w-md space-y-5">
              <div className="modal-header">
                <h3 className="text-lg font-semibold text-[color:var(--heading)]">
                  {actionModal.action === 'approve' ? 'Approve content' : 'Reject content'}
                </h3>
              </div>

              <div className="modal-body space-y-4">
                <section className="panel-muted space-y-1">
                  <div className="font-medium text-[color:var(--heading)]">
                    {actionModal.item.contentName || 'Unnamed content'}
                  </div>
                  <div className="text-sm text-muted">
                    {adminService.formatContentType(actionModal.item.contentType)} by{' '}
                    {actionModal.item.submitterUsername}
                  </div>
                </section>

                <div>
                  <label
                    htmlFor={notesFieldId}
                    className="mb-2 block text-sm font-medium text-[color:var(--heading)]"
                  >
                    {actionModal.action === 'approve'
                      ? 'Notes (optional)'
                      : 'Reason for rejection (required)'}
                  </label>
                  <textarea
                    id={notesFieldId}
                    value={actionNotes}
                    onChange={(event) => setActionNotes(event.target.value)}
                    className="w-full rounded border border-[color:var(--panel-border)] bg-[color:var(--panel-bg-alt)] px-3 py-2 text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)]"
                    rows={4}
                    placeholder={
                      actionModal.action === 'approve'
                        ? 'Optional notes about the approval...'
                        : 'Please explain why this content is being rejected...'
                    }
                  />
                </div>

                {actionError && (
                  <p className="text-sm text-[color:var(--color-danger)]">{actionError}</p>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" onClick={closeActionModal} className="btn-secondary">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleContentAction}
                  disabled={
                    submittingAction || (actionModal.action === 'reject' && !actionNotes.trim())
                  }
                  className={actionModal.action === 'approve' ? 'btn-success' : 'btn-danger'}
                >
                  {submittingAction
                    ? 'Working...'
                    : actionModal.action === 'approve'
                      ? '✅ Approve'
                      : '❌ Reject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
