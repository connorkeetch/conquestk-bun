import type React from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'

interface Map {
  id: string
  name: string
  description?: string
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived'
  creatorId: string
  creatorName?: string
  imageUrl?: string
  isPublic: boolean
  isFeatured: boolean
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
  const [approvalNotes, setApprovalNotes] = useState('')
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    minPlayers: 2,
    maxPlayers: 6,
    tags: [] as string[],
    isFeatured: false,
    isPublic: true,
  })

  useEffect(() => {
    loadMaps()
  }, [filters])

  const loadMaps = async () => {
    try {
      setLoading(true)
      const response = await api.get('/admin/maps', {
        params: {
          ...filters,
          includeAll: true, // Include all statuses
        },
      })
      setMaps(response.data.maps || [])
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load maps')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (mapId: string, newStatus: string, notes?: string) => {
    try {
      await api.patch(`/admin/maps/${mapId}/status`, {
        status: newStatus,
        notes: notes,
      })
      await loadMaps()
      setShowApprovalModal(false)
      setApprovalNotes('')
      alert(`Map ${newStatus === 'approved' ? 'approved' : 'rejected'} successfully!`)
    } catch (err: any) {
      alert(`Failed to update status: ${err.response?.data?.message || err.message}`)
    }
  }

  const handleEditMap = async () => {
    if (!selectedMap) return
    try {
      await api.patch(`/admin/maps/${selectedMap.id}`, editForm)
      await loadMaps()
      setShowEditModal(false)
      alert('Map updated successfully!')
    } catch (err: any) {
      alert(`Failed to update map: ${err.response?.data?.message || err.message}`)
    }
  }

  const handleDeleteMap = async () => {
    if (!selectedMap) return
    try {
      await api.delete(`/admin/maps/${selectedMap.id}`)
      await loadMaps()
      setShowDeleteModal(false)
      alert('Map deleted successfully!')
    } catch (err: any) {
      alert(`Failed to delete map: ${err.response?.data?.message || err.message}`)
    }
  }

  const handleCloneMap = async (mapId: string) => {
    try {
      const response = await api.post(`/admin/maps/${mapId}/clone`)
      await loadMaps()
      alert(`Map cloned successfully! New map: ${response.data.name}`)
    } catch (err: any) {
      alert(`Failed to clone map: ${err.response?.data?.message || err.message}`)
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
      {/* Header */}
      <div className="bg-surface-2 rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Maps Management</h1>
            <p className="text-muted mt-1">Manage all maps in the system</p>
          </div>
          <Link to="/admin" className="text-muted hover:text-white font-medium">
            ← Back to Admin Dashboard
          </Link>
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

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {['pending_review', 'approved', 'rejected', 'draft', 'archived'].map((status) => {
          const count = maps.filter(m => m.status === status).length
          return (
            <div key={status} className="bg-surface-2 p-4 rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{getStatusIcon(status)}</span>
                <span className="text-2xl font-bold text-white">{count}</span>
              </div>
              <div className="text-sm text-muted mt-1 capitalize">
                {status.replace('_', ' ')}
              </div>
            </div>
          )
        })}
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
                {maps.map((map) => (
                  <tr 
                    key={map.id} 
                    className={`hover:bg-surface-1 ${
                      map.status === 'pending_review' ? 'bg-yellow-900/10' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {map.imageUrl && (
                          <img 
                            src={map.imageUrl} 
                            alt={map.name}
                            className="w-10 h-10 rounded mr-3 object-cover"
                          />
                        )}
                        <div>
                          <div className="text-sm font-medium text-white">
                            {map.name}
                            {map.isFeatured && (
                              <span className="ml-2 text-yellow-400">⭐</span>
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
                      <div className="text-sm text-muted">{map.minPlayers}-{map.maxPlayers}</div>
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
                            >
                              ✅ Approve
                            </button>
                            <button
                              onClick={() => openApprovalModal(map)}
                              className="text-red-400 hover:text-red-300 text-sm font-medium"
                            >
                              ❌ Reject
                            </button>
                          </div>
                        )}
                        
                        {/* Standard Actions */}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => window.location.href = `/create-map?edit=${map.id}`}
                            className="text-violet hover:text-violet-soft text-sm font-medium"
                            title="Open in Map Editor"
                          >
                            🗺️ Edit Map
                          </button>
                          <button
                            onClick={() => openEditModal(map)}
                            className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                            title="Edit map details"
                          >
                            ✏️ Edit Details
                          </button>
                          <button
                            onClick={() => handleCloneMap(map.id)}
                            className="text-green-400 hover:text-green-300 text-sm font-medium"
                            title="Clone this map"
                          >
                            📋 Clone
                          </button>
                          <button
                            onClick={() => {
                              setSelectedMap(map)
                              setShowDeleteModal(true)
                            }}
                            className="text-red-400 hover:text-red-300 text-sm font-medium"
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
                            >
                              ⭐ Feature
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
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
                <label className="block text-sm text-muted mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm text-muted mb-1">Status</label>
                <select
                  value={editForm.status || 'draft'}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
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
                <label className="block text-sm text-muted mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white h-20"
                />
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-muted mb-1">Min Players</label>
                  <input
                    type="number"
                    min="2"
                    max="12"
                    value={editForm.minPlayers}
                    onChange={(e) => setEditForm({ ...editForm, minPlayers: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-muted mb-1">Max Players</label>
                  <input
                    type="number"
                    min="2"
                    max="12"
                    value={editForm.maxPlayers}
                    onChange={(e) => setEditForm({ ...editForm, maxPlayers: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                  />
                </div>
              </div>
              
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={editForm.isFeatured}
                    onChange={(e) => setEditForm({ ...editForm, isFeatured: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-white">Featured</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={editForm.isPublic}
                    onChange={(e) => setEditForm({ ...editForm, isPublic: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-white">Public</span>
                </label>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 bg-surface-1 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
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
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-surface-1 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
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
            <p className="text-muted mb-4">
              Provide a reason for rejecting "{selectedMap.name}":
            </p>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white h-32"
              placeholder="Enter rejection reason..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowApprovalModal(false)
                  setApprovalNotes('')
                }}
                className="px-4 py-2 bg-surface-1 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusChange(selectedMap.id, 'rejected', approvalNotes)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Reject Map
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminMaps