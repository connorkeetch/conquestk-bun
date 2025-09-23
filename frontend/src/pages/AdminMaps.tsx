import { isAxiosError } from 'axios'
import type React from 'react'
import { useCallback, useEffect, useId, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'

const getErrorMessage = (error: unknown, fallback: string) => {
  if (isAxiosError(error)) {
    return error.response?.data?.message || error.message || fallback
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}

interface Map {
  id: string
  name: string
  description?: string
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived'
  creatorId: string
  creatorName?: string
  imageUrl?: string
  image_url?: string
  isPublic: boolean
  isFeatured: boolean
  isVipOnly?: boolean
  minPlayers: number
  maxPlayers: number
  playCount: number
  ratingAverage: number
  ratingCount: number
  tags: string[]
  createdAt: string
  updatedAt: string
  reviewNotes?: string
  rejectionReason?: string
}

interface MapFilters {
  status?: string
  search?: string
  creatorId?: string
  sortBy: string
}

export const AdminMaps: React.FC = () => {
  const [maps, setMaps] = useState<Map[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<MapFilters>({ sortBy: 'newest' })
  const [selectedMap, setSelectedMap] = useState<Map | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewMap, setPreviewMap] = useState<Map | null>(null)
  const previewImageSrc = previewMap ? previewMap.imageUrl || previewMap.image_url : undefined
  const [approvalNotes, setApprovalNotes] = useState('')
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    minPlayers: 2,
    maxPlayers: 6,
    tags: [] as string[],
    status: 'draft' as Map['status'],
    isFeatured: false,
    isPublic: true,
    isVipOnly: false,
  })
  const mapNameId = useId()
  const mapStatusId = useId()
  const mapDescriptionId = useId()
  const mapMinPlayersId = useId()
  const mapMaxPlayersId = useId()
  const mapFeaturedId = useId()
  const mapPublicId = useId()
  const mapVipOnlyId = useId()

  const loadMaps = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/admin/maps', {
        params: {
          ...filters,
          includeAll: true, // Include all statuses
        },
      })
      setMaps(response.data.maps || [])
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to load maps'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void loadMaps()
  }, [loadMaps])

  const handleStatusChange = async (mapId: string, newStatus: string, notes?: string) => {
    try {
      await api.patch(`/admin/maps/${mapId}/status`, {
        status: newStatus,
        notes: notes,
      })
      await loadMaps()
      setShowApprovalModal(false)
      setApprovalNotes('')
      toast.success(`Map ${newStatus === 'approved' ? 'approved' : 'rejected'} successfully`)
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to update status')
      toast.error(`Failed to update status: ${message}`)
    }
  }

  const handleEditMap = async () => {
    if (!selectedMap) return
    try {
      await api.patch(`/admin/maps/${selectedMap.id}`, editForm)
      await loadMaps()
      setShowEditModal(false)
      toast.success('Map updated successfully')
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to update map')
      toast.error(`Failed to update map: ${message}`)
    }
  }

  const handleDeleteMap = async () => {
    if (!selectedMap) return
    try {
      await api.delete(`/admin/maps/${selectedMap.id}`)
      await loadMaps()
      setShowDeleteModal(false)
      toast.success('Map deleted successfully')
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to delete map')
      toast.error(`Failed to delete map: ${message}`)
    }
  }

  const handleCloneMap = async (mapId: string) => {
    try {
      const response = await api.post(`/admin/maps/${mapId}/clone`)
      await loadMaps()
      toast.success(`Map cloned successfully. New map: ${response.data.name}`)
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to clone map')
      toast.error(`Failed to clone map: ${message}`)
    }
  }

  const openEditModal = (map: Map) => {
    setSelectedMap(map)
    setEditForm({
      name: map.name,
      description: map.description || '',
      minPlayers: map.minPlayers,
      maxPlayers: map.maxPlayers,
      tags: map.tags,
      status: map.status || 'draft',
      isFeatured: map.isFeatured,
      isPublic: map.isPublic,
      isVipOnly: map.isVipOnly || false,
    })
    setShowEditModal(true)
  }

  const openApprovalModal = (map: Map) => {
    setSelectedMap(map)
    setShowApprovalModal(true)
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: 'bg-gray-100 text-gray-800',
      pending_review: 'bg-yellow-100 text-yellow-800 ring-2 ring-yellow-400',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      archived: 'bg-gray-100 text-gray-600',
    }
    return badges[status as keyof typeof badges] || badges.draft
  }

  const getStatusIcon = (status: string) => {
    const icons = {
      draft: '📝',
      pending_review: '⏳',
      approved: '✅',
      rejected: '❌',
      archived: '📦',
    }
    return icons[status as keyof typeof icons] || '📄'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted">Loading maps...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Status Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Draft</p>
              <p className="text-2xl font-bold text-white">
                {maps.filter((m) => m.status === 'draft').length}
              </p>
            </div>
            <span className="text-2xl">📝</span>
          </div>
        </div>
        <div className="bg-surface-2 rounded-lg border border-orange-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-400">Pending Review</p>
              <p className="text-2xl font-bold text-white">
                {maps.filter((m) => m.status === 'pending_review').length}
              </p>
            </div>
            <span className="text-2xl">⏳</span>
          </div>
        </div>
        <div className="bg-surface-2 rounded-lg border border-green-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-400">Approved</p>
              <p className="text-2xl font-bold text-white">
                {maps.filter((m) => m.status === 'approved').length}
              </p>
            </div>
            <span className="text-2xl">✅</span>
          </div>
        </div>
        <div className="bg-surface-2 rounded-lg border border-red-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-400">Rejected</p>
              <p className="text-2xl font-bold text-white">
                {maps.filter((m) => m.status === 'rejected').length}
              </p>
            </div>
            <span className="text-2xl">❌</span>
          </div>
        </div>
        <div className="bg-surface-2 rounded-lg border border-gray-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Archived</p>
              <p className="text-2xl font-bold text-white">
                {maps.filter((m) => m.status === 'archived').length}
              </p>
            </div>
            <span className="text-2xl">📦</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-2 rounded-lg shadow-sm border border-border p-4">
        <div className="flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Search maps..."
            value={filters.search || ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="px-4 py-2 bg-surface-1 border border-border rounded-lg text-white flex-1 min-w-[200px]"
          />

          <select
            value={filters.status || ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-4 py-2 bg-surface-1 border border-border rounded-lg text-white"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending_review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="archived">Archived</option>
          </select>

          <select
            value={filters.sortBy}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
            className="px-4 py-2 bg-surface-1 border border-border rounded-lg text-white"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Name A-Z</option>
            <option value="playCount">Most Played</option>
            <option value="rating">Highest Rated</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <div className="flex">
            <span className="text-red-400 mr-3">⚠️</span>
            <div>
              <h3 className="text-red-400 font-medium">Error Loading Maps</h3>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Maps Table */}
      <div className="bg-surface-2 rounded-lg shadow-sm border border-border overflow-hidden">
        {maps.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-muted text-6xl mb-4">🗺️</div>
            <h3 className="text-lg font-medium text-white mb-2">No Maps Found</h3>
            <p className="text-muted">No maps match your current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-1">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Map
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Creator
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Players
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Stats
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {maps.map((map) => {
                  const imageSrc = map.imageUrl || map.image_url

                  return (
                    <tr
                      key={map.id}
                      className={`hover:bg-surface-1 ${
                        map.status === 'pending_review' ? 'bg-yellow-900/10' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          {imageSrc && (
                            <button
                              onClick={() => {
                                setPreviewMap(map)
                                setShowPreviewModal(true)
                              }}
                              className="relative group mr-3"
                              type="button"
                            >
                              <img
                                src={imageSrc}
                                alt={map.name}
                                className="w-10 h-10 rounded object-cover cursor-pointer transition-transform hover:scale-110"
                              />
                              <div className="absolute hidden group-hover:block z-10 -top-32 left-0 p-2 bg-surface-1 border border-border rounded-lg shadow-xl">
                                <img
                                  src={imageSrc}
                                  alt={map.name}
                                  className="w-32 h-32 object-cover rounded"
                                />
                              </div>
                            </button>
                          )}
                          <div>
                            <div className="text-sm font-medium text-white">
                              {map.name}
                              {map.isFeatured && (
                                <span className="ml-2 text-yellow-400" title="Featured">
                                  ⭐
                                </span>
                              )}
                              {map.isVipOnly && (
                                <span className="ml-2 text-purple-400" title="VIP Only">
                                  👑
                                </span>
                              )}
                              {!map.isPublic && (
                                <span className="ml-2 text-gray-400" title="Private">
                                  🔒
                                </span>
                              )}
                            </div>
                            {map.description && (
                              <div className="text-xs text-muted truncate max-w-xs">
                                {map.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(map.status)}`}
                        >
                          {getStatusIcon(map.status)} {map.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-white">{map.creatorName || 'Unknown'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-muted">
                          {map.minPlayers}-{map.maxPlayers}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs space-y-1">
                          <div className="text-muted">🎮 {map.playCount || 0} plays</div>
                          <div className="text-muted">
                            ⭐ {(map.ratingAverage || 0).toFixed(1)} ({map.ratingCount || 0})
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-muted">
                          {new Date(map.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {/* Approval Actions for Pending Maps */}
                          {map.status === 'pending_review' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleStatusChange(map.id, 'approved')}
                                className="text-green-400 hover:text-green-300 text-sm font-medium"
                                type="button"
                              >
                                ✅ Approve
                              </button>
                              <button
                                onClick={() => openApprovalModal(map)}
                                className="text-red-400 hover:text-red-300 text-sm font-medium"
                                type="button"
                              >
                                ❌ Reject
                              </button>
                            </div>
                          )}

                          {/* Standard Actions */}
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => {
                                setPreviewMap(map)
                                setShowPreviewModal(true)
                              }}
                              className="text-cyan-400 hover:text-cyan-300 text-sm font-medium"
                              title="Preview map"
                              type="button"
                            >
                              👁️ Preview
                            </button>
                            <button
                              onClick={() =>
                                window.open(`/map-editor-tokens?edit=${map.id}`, '_blank')
                              }
                              className="text-violet hover:text-violet-soft text-sm font-medium"
                              title="Open in Map Editor"
                              type="button"
                            >
                              🗺️ Edit Map
                            </button>
                            <button
                              onClick={() => openEditModal(map)}
                              className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                              title="Edit map details"
                              type="button"
                            >
                              ✏️ Edit Details
                            </button>
                            <button
                              onClick={() => handleCloneMap(map.id)}
                              className="text-green-400 hover:text-green-300 text-sm font-medium"
                              title="Clone this map"
                              type="button"
                            >
                              📋 Clone
                            </button>
                            <button
                              onClick={() => {
                                setSelectedMap(map)
                                setShowDeleteModal(true)
                              }}
                              className="text-red-400 hover:text-red-300 text-sm font-medium"
                              type="button"
                            >
                              🗑️ Delete
                            </button>
                            {map.status === 'approved' && !map.isFeatured && (
                              <button
                                onClick={() => {
                                  setSelectedMap(map)
                                  setEditForm({ ...editForm, isFeatured: true })
                                  handleEditMap()
                                }}
                                className="text-yellow-400 hover:text-yellow-300 text-sm font-medium"
                                type="button"
                              >
                                ⭐ Feature
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedMap && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-2 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Edit Map Details</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-muted mb-1" htmlFor={mapNameId}>
                  Name
                </label>
                <input
                  id={mapNameId}
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                />
              </div>

              <div>
                <label className="block text-sm text-muted mb-1" htmlFor={mapStatusId}>
                  Status
                </label>
                <select
                  id={mapStatusId}
                value={editForm.status}
                onChange={(e) =>
                  setEditForm({ ...editForm, status: e.target.value as Map['status'] })
                }
                  className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                >
                  <option value="draft">Draft</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-muted mb-1" htmlFor={mapDescriptionId}>
                  Description
                </label>
                <textarea
                  id={mapDescriptionId}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white h-20"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-muted mb-1" htmlFor={mapMinPlayersId}>
                    Min Players
                  </label>
                  <input
                    id={mapMinPlayersId}
                    type="number"
                    min="2"
                    max="12"
                    value={editForm.minPlayers}
                    onChange={(e) =>
                      setEditForm({ ...editForm, minPlayers: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-muted mb-1" htmlFor={mapMaxPlayersId}>
                    Max Players
                  </label>
                  <input
                    id={mapMaxPlayersId}
                    type="number"
                    min="2"
                    max="12"
                    value={editForm.maxPlayers}
                    onChange={(e) =>
                      setEditForm({ ...editForm, maxPlayers: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex gap-4">
                  <label className="flex items-center" htmlFor={mapFeaturedId}>
                    <input
                      id={mapFeaturedId}
                      type="checkbox"
                      checked={editForm.isFeatured}
                      onChange={(e) => setEditForm({ ...editForm, isFeatured: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-white">⭐ Featured</span>
                  </label>
                  <label className="flex items-center" htmlFor={mapPublicId}>
                    <input
                      id={mapPublicId}
                      type="checkbox"
                      checked={editForm.isPublic}
                      onChange={(e) => setEditForm({ ...editForm, isPublic: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-white">🌍 Public</span>
                  </label>
                </div>
                <div>
                  <label className="flex items-center" htmlFor={mapVipOnlyId}>
                    <input
                      id={mapVipOnlyId}
                      type="checkbox"
                      checked={editForm.isVipOnly || false}
                      onChange={(e) => setEditForm({ ...editForm, isVipOnly: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-white">👑 VIP Only</span>
                    <span className="text-xs text-purple-400 ml-2">
                      (Requires VIP status to play)
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 bg-surface-1 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditMap}
                className="px-4 py-2 bg-violet text-white rounded hover:brightness-110"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedMap && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-2 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Delete Map</h2>
            <p className="text-muted mb-4">
              Are you sure you want to delete "{selectedMap.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-surface-1 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMap}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showApprovalModal && selectedMap && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-2 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Reject Map</h2>
            <p className="text-muted mb-4">Provide a reason for rejecting "{selectedMap.name}":</p>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white h-32"
              placeholder="Enter rejection reason..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowApprovalModal(false)
                  setApprovalNotes('')
                }}
                className="px-4 py-2 bg-surface-1 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange(selectedMap.id, 'rejected', approvalNotes)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Reject Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Preview Modal */}
      {showPreviewModal && previewMap && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview map ${previewMap.name}`}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          tabIndex={-1}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowPreviewModal(false)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setShowPreviewModal(false)
            }
          }}
        >
          <div
            role="document"
            className="bg-surface-2 rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">{previewMap.name}</h2>
                {previewMap.description && (
                  <p className="text-muted mt-2">{previewMap.description}</p>
                )}
                <div className="flex gap-4 mt-3 text-sm">
                  <span className="text-muted">
                    <span className="text-white font-medium">
                      {previewMap.minPlayers}-{previewMap.maxPlayers}
                    </span>{' '}
                    Players
                  </span>
                  <span className="text-muted">
                    Created by{' '}
                    <span className="text-white font-medium">
                      {previewMap.creatorName || 'Unknown'}
                    </span>
                  </span>
                  {previewMap.playCount > 0 && (
                    <span className="text-muted">
                      <span className="text-white font-medium">{previewMap.playCount}</span> Plays
                    </span>
                  )}
                  {previewMap.ratingCount > 0 && (
                    <span className="text-muted">
                      Rating:{' '}
                      <span className="text-white font-medium">
                        {previewMap.ratingAverage.toFixed(1)}/5
                      </span>{' '}
                      ({previewMap.ratingCount} reviews)
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  {previewMap.isFeatured && (
                    <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded text-xs">
                      ⭐ Featured
                    </span>
                  )}
                  {previewMap.isVipOnly && (
                    <span className="px-2 py-1 bg-purple-600/20 text-purple-400 rounded text-xs">
                      👑 VIP Only
                    </span>
                  )}
                  {!previewMap.isPublic && (
                    <span className="px-2 py-1 bg-gray-600/20 text-gray-400 rounded text-xs">
                      🔒 Private
                    </span>
                  )}
                  <span
                    className={`px-2 py-1 rounded text-xs ${getStatusBadge(previewMap.status)}`}
                  >
                    {getStatusIcon(previewMap.status)} {previewMap.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-muted hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            {/* Map Image Preview */}
            {previewImageSrc ? (
              <div className="bg-surface-1 rounded-lg p-4 mb-4">
                <img
                  src={previewImageSrc}
                  alt={previewMap.name}
                  className="w-full h-auto max-h-[500px] object-contain rounded"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.src =
                      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzk5OSI+TWFwIEltYWdlIE5vdCBBdmFpbGFibGU8L3RleHQ+PC9zdmc+'
                  }}
                />
              </div>
            ) : (
              <div className="bg-surface-1 rounded-lg p-12 mb-4 text-center">
                <div className="text-6xl mb-4">🗺️</div>
                <p className="text-muted">No preview image available</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => window.open(`/map-editor-tokens?edit=${previewMap.id}`, '_blank')}
                className="px-4 py-2 bg-violet text-white rounded hover:brightness-110"
              >
                🗺️ Open in Map Editor
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPreviewModal(false)
                  openEditModal(previewMap)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                ✏️ Edit Details
              </button>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 bg-surface-1 text-white rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminMaps
