import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Link, useNavigate } from 'react-router-dom'

interface ApprovalRequest {
  id: string
  versionId: string
  requesterId: string
  assignedModeratorId?: string
  submissionNotes?: string
  priorityLevel: string
  estimatedReviewTime?: number
  reviewStartedAt?: string
  createdAt: string
  versionName: string
  versionNumber: string
  requesterUsername: string
  assignedModeratorUsername?: string
}

interface ApprovalStats {
  total_requests: number
  approved: number
  rejected: number
  pending: number
  avg_review_hours: number
}

export const AdminMapReviews: React.FC = () => {
  const navigate = useNavigate()

  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([])
  const [stats, setStats] = useState<ApprovalStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'assign' | 'priority' | ''>('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Load pending approval requests
      const requestsResponse = await fetch('/api/map-approval/approval-requests', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!requestsResponse.ok) {
        throw new Error('Failed to load approval requests')
      }

      const requestsData = await requestsResponse.json()
      setApprovalRequests(requestsData.requests || [])

      // Load approval statistics
      const statsResponse = await fetch('/api/map-approval/stats/approvals', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setStats(statsData.stats)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load review queue'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleAssignToSelf = async (requestId: string) => {
    try {
      const response = await fetch(`/api/map-approval/approval-requests/${requestId}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to assign request')
      }

      // Reload data to reflect changes
      await loadData()
      toast.success('Request assigned to you')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to assign request'
      setError(message)
      toast.error(message)
    }
  }

  const handleRequestSelection = (requestId: string, selected: boolean) => {
    const newSelection = new Set(selectedRequests)
    if (selected) {
      newSelection.add(requestId)
    } else {
      newSelection.delete(requestId)
    }
    setSelectedRequests(newSelection)
  }

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedRequests(new Set(approvalRequests.map((r) => r.id)))
    } else {
      setSelectedRequests(new Set())
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500/20 text-red-200 border border-red-500/40'
      case 'high':
        return 'bg-orange-500/20 text-orange-200 border border-orange-500/40'
      case 'normal':
        return 'bg-blue-500/20 text-blue-200 border border-blue-500/40'
      case 'low':
        return 'bg-gray-500/20 text-gray-200 border border-gray-500/40'
      default:
        return 'bg-gray-500/20 text-gray-200 border border-gray-500/40'
    }
  }

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))

    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    return `${Math.floor(diffInHours / 24)}d ago`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-1">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted">Loading review queue...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-1 p-6">
      <div className="max-w-screen-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-surface-2 rounded-lg border border-border p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Map Review Queue</h1>
              <p className="text-muted mt-1">Review and approve submitted maps for publication</p>
            </div>
            <Link to="/admin" className="text-primary-soft hover:text-primary font-medium">
              ← Back to Admin Dashboard
            </Link>
          </div>
        </div>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-surface-2 p-6 rounded-lg border border-border shadow-sm">
              <div className="text-2xl font-bold text-yellow-400">{stats.pending || 0}</div>
              <div className="text-sm font-medium text-muted">Pending Reviews</div>
            </div>
            <div className="bg-surface-2 p-6 rounded-lg border border-border shadow-sm">
              <div className="text-2xl font-bold text-green-400">{stats.approved || 0}</div>
              <div className="text-sm font-medium text-muted">Approved (30d)</div>
            </div>
            <div className="bg-surface-2 p-6 rounded-lg border border-border shadow-sm">
              <div className="text-2xl font-bold text-red-400">{stats.rejected || 0}</div>
              <div className="text-sm font-medium text-muted">Rejected (30d)</div>
            </div>
            <div className="bg-surface-2 p-6 rounded-lg border border-border shadow-sm">
              <div className="text-2xl font-bold text-primary-soft">
                {stats.total_requests || 0}
              </div>
              <div className="text-sm font-medium text-muted">Total (30d)</div>
            </div>
            <div className="bg-surface-2 p-6 rounded-lg border border-border shadow-sm">
              <div className="text-2xl font-bold text-purple-400">
                {stats.avg_review_hours ? Math.round(stats.avg_review_hours) : 0}h
              </div>
              <div className="text-sm font-medium text-muted">Avg Review Time</div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-500/40 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="text-red-300 text-xl">⚠️</div>
              <div>
                <h3 className="text-red-200 font-medium">Error loading reviews</h3>
                <p className="text-red-200/80 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Review Queue */}
        <div className="bg-surface-2 rounded-lg shadow-sm border border-border">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pending Reviews ({approvalRequests.length})</h2>

              {selectedRequests.size > 0 && (
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-muted">{selectedRequests.size} selected</span>
                  <select
                    value={bulkAction}
                    onChange={(e) => setBulkAction(e.target.value as '' | 'assign' | 'priority')}
                    className="form-select text-sm"
                  >
                    <option value="">Bulk Actions</option>
                    <option value="assign">Assign to Me</option>
                    <option value="priority">Change Priority</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {approvalRequests.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-muted text-6xl mb-4">📋</div>
              <h3 className="text-lg font-medium text-[color:var(--heading)] mb-2">
                No Pending Reviews
              </h3>
              <p className="text-muted">
                All maps have been reviewed! Check back later for new submissions.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-1">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedRequests.size === approvalRequests.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-border bg-surface-1 focus:ring-primary focus:border-primary"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Map
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Creator
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Submitted
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {approvalRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-surface-1">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedRequests.has(request.id)}
                          onChange={(e) => handleRequestSelection(request.id, e.target.checked)}
                          className="rounded border-border bg-surface-1 focus:ring-primary focus:border-primary"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-white">
                            {request.versionName}
                          </div>
                          <div className="text-sm text-muted">v{request.versionNumber}</div>
                          {request.submissionNotes && (
                            <div className="text-xs text-muted mt-1 max-w-xs truncate">
                              "{request.submissionNotes}"
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-white">{request.requesterUsername}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(
                            request.priorityLevel,
                          )}`}
                        >
                          {request.priorityLevel}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-white">{getTimeAgo(request.createdAt)}</div>
                      </td>
                      <td className="px-6 py-4">
                        {request.assignedModeratorId ? (
                          <div className="flex items-center">
                            <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                            <span className="text-sm text-white">
                              {request.assignedModeratorUsername || 'Assigned'}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <div className="w-2 h-2 bg-gray-500 rounded-full mr-2"></div>
                            <span className="text-sm text-muted">Unassigned</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          {!request.assignedModeratorId && (
                            <button
                              type="button"
                              onClick={() => handleAssignToSelf(request.id)}
                              className="text-primary-soft hover:text-white text-sm font-medium"
                            >
                              Assign to Me
                            </button>
                          )}
                          <Link
                            to={`/admin/map-review/${request.id}`}
                            className="text-primary hover:text-white text-sm font-medium"
                          >
                            Review
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-surface-2 rounded-lg shadow-sm border border-border p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => navigate('/admin/map-review-criteria')}
              className="p-4 border border-border rounded-lg hover:bg-surface-1 text-left transition-colors"
            >
              <div className="text-sm font-medium">Review Criteria</div>
              <div className="text-xs text-muted mt-1">Manage standardized review criteria</div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/admin/maps')}
              className="p-4 border border-border rounded-lg hover:bg-surface-1 text-left transition-colors"
            >
              <div className="text-sm font-medium">All Maps</div>
              <div className="text-xs text-muted mt-1">View and manage all maps in the system</div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/admin/map-analytics')}
              className="p-4 border border-border rounded-lg hover:bg-surface-1 text-left transition-colors"
            >
              <div className="text-sm font-medium">Analytics</div>
              <div className="text-xs text-muted mt-1">View map usage and review statistics</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminMapReviews
