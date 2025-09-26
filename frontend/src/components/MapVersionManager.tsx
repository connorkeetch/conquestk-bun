import type React from 'react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { logger } from '@/utils/logger'

interface MapVersion {
  id: string
  mapId: string
  versionNumber: string
  versionMajor: number
  versionMinor: number
  versionPatch: number
  isCurrent: boolean
  statusId: string
  name: string
  description?: string
  changelog?: string
  createdBy: string
  createdAt: string
  publishedAt?: string
  statusName?: string
  statusColor?: string
}

interface VersionCreationData {
  name: string
  description: string
  changelog: string
  versionType: 'major' | 'minor' | 'patch'
  tags: string[]
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'An unexpected error occurred while managing map versions.'
}

export const MapVersionManager: React.FC = () => {
  const { mapId } = useParams<{ mapId: string }>()

  const [versions, setVersions] = useState<MapVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const versionIdBase = useId()
  const fieldIds = useMemo(() => {
    const baseId = versionIdBase
    return {
      versionType: `${baseId}-type`,
      versionName: `${baseId}-name`,
      description: `${baseId}-description`,
      changelog: `${baseId}-changelog`,
    }
  }, [versionIdBase])
  const [newVersionData, setNewVersionData] = useState<VersionCreationData>({
    name: '',
    description: '',
    changelog: '',
    versionType: 'patch',
    tags: [],
  })

  const loadVersions = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/map-approval/maps/${mapId}/versions`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to load versions')
      }

      const data = await response.json()
      setVersions(data.versions || [])
    } catch (error) {
      const message = getErrorMessage(error)
      logger.error('Failed to load map versions', error)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [mapId])

  useEffect(() => {
    if (mapId) {
      loadVersions()
    }
  }, [mapId, loadVersions])

  const handleCreateVersion = async () => {
    try {
      setCreating(true)
      setError(null)

      const response = await fetch(`/api/map-approval/maps/${mapId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(newVersionData),
      })

      if (!response.ok) {
        throw new Error('Failed to create version')
      }

      // Reset form and close modal
      setNewVersionData({
        name: '',
        description: '',
        changelog: '',
        versionType: 'patch',
        tags: [],
      })
      setShowCreateModal(false)

      // Reload versions
      await loadVersions()
    } catch (error) {
      const message = getErrorMessage(error)
      logger.error('Failed to create map version', error)
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  const handleSetCurrent = async (versionId: string) => {
    try {
      const response = await fetch(`/api/map-approval/versions/${versionId}/current`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to set current version')
      }

      await loadVersions()
    } catch (error) {
      const message = getErrorMessage(error)
      logger.error('Failed to set current map version', error)
      setError(message)
    }
  }

  const handleSubmitForApproval = async (versionId: string) => {
    try {
      const submissionNotes = prompt('Optional notes for the reviewers:')

      const response = await fetch(`/api/map-approval/versions/${versionId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ submissionNotes }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit for approval')
      }

      await loadVersions()
      alert('Version submitted for approval! You will be notified once it has been reviewed.')
    } catch (error) {
      const message = getErrorMessage(error)
      logger.error('Failed to submit map version for approval', error)
      setError(message)
    }
  }

  const getStatusBadge = (version: MapVersion) => {
    const getStatusColor = (statusName: string) => {
      const baseNeutral =
        'border border-[color:var(--panel-border)] text-muted bg-[color:var(--panel-bg-alt)]'
      switch (statusName) {
        case 'draft':
          return baseNeutral
        case 'submitted':
          return 'border border-[color:var(--color-info)] text-[color:var(--color-info)] bg-[color:color-mix(in srgb, var(--color-info) 15%, transparent)]'
        case 'under_review':
          return 'border border-[color:var(--color-warning)] text-[color:var(--color-warning)] bg-[color:color-mix(in srgb, var(--color-warning) 15%, transparent)]'
        case 'approved':
          return 'border border-[color:var(--color-success)] text-[color:var(--color-success)] bg-[color:color-mix(in srgb, var(--color-success) 12%, transparent)]'
        case 'published':
          return 'border border-[color:var(--color-success)] text-[color:var(--color-success)] bg-[color:color-mix(in srgb, var(--color-success) 18%, transparent)] font-semibold'
        case 'rejected':
          return 'border border-[color:var(--color-danger)] text-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)]'
        case 'archived':
          return baseNeutral
        default:
          return baseNeutral
      }
    }

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
          version.statusName || '',
        )}`}
      >
        {version.statusName?.replace('_', ' ')}
      </span>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted">Loading versions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[color:var(--heading)]">Version Management</h2>
          <p className="text-sm text-muted mt-1">
            Manage different versions of your map and track their approval status
          </p>
        </div>
        <button type="button" onClick={() => setShowCreateModal(true)} className="btn-primary">
          Create New Version
        </button>
      </div>

      {error && (
        <div className="bg-[color:color-mix(in srgb, var(--color-danger) 10%, transparent)] border border-[color:var(--color-danger)] rounded-lg p-4">
          <div className="flex">
            <div className="text-[color:var(--color-danger)] opacity-80 mr-3">⚠️</div>
            <div>
              <h3 className="text-[color:var(--color-danger)] font-medium">Error</h3>
              <p className="text-[color:var(--color-danger)] text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Versions List */}
      <div className="bg-[color:var(--panel-bg)] rounded-lg shadow-sm border border-[color:var(--panel-border)]">
        {versions.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-muted text-6xl mb-4">📝</div>
            <h3 className="text-lg font-medium text-[color:var(--heading)] mb-2">
              No Versions Yet
            </h3>
            <p className="text-muted mb-6">
              Create your first version to start managing your map's development.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="btn-primary px-6 py-3"
            >
              Create Version 1.0.0
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[color:var(--panel-bg-alt)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Published
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[color:var(--panel-bg)] divide-y divide-[color:var(--panel-border)]">
                {versions.map((version) => (
                  <tr
                    key={version.id}
                    className={
                      version.isCurrent
                        ? 'bg-[color:color-mix(in srgb, var(--color-primary) 12%, transparent)]'
                        : 'hover:bg-[color:var(--hover-bg)]'
                    }
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-[color:var(--text)]">
                          v{version.versionNumber}
                        </div>
                        {version.isCurrent && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[color:color-mix(in srgb, var(--color-primary) 15%, transparent)] text-[color:var(--color-primary)]">
                            Current
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-[color:var(--text)]">
                          {version.name}
                        </div>
                        {version.description && (
                          <div className="text-sm text-muted">{version.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(version)}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-[color:var(--text)]">
                        {formatDate(version.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-[color:var(--text)]">
                        {version.publishedAt ? formatDate(version.publishedAt) : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        {!version.isCurrent && version.statusName === 'published' && (
                          <button
                            type="button"
                            onClick={() => handleSetCurrent(version.id)}
                            className="text-[color:var(--color-primary)] hover:underline text-sm font-medium"
                          >
                            Set Current
                          </button>
                        )}
                        {version.statusName === 'draft' && (
                          <button
                            type="button"
                            onClick={() => handleSubmitForApproval(version.id)}
                            className="text-[color:var(--color-success)] hover:underline text-sm font-medium"
                          >
                            Submit for Approval
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-gray-600 hover:text-gray-800 text-sm font-medium"
                        >
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Version Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[color:var(--panel-bg)] border border-[color:var(--panel-border)] rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-[color:var(--heading)] mb-4">
              Create New Version
            </h3>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor={fieldIds.versionType}
                  className="block text-sm font-medium text-[color:var(--heading)] mb-2"
                >
                  Version Type
                </label>
                <select
                  id={fieldIds.versionType}
                  value={newVersionData.versionType}
                  onChange={(e) =>
                    setNewVersionData((prev) => ({
                      ...prev,
                      versionType: e.target.value as 'major' | 'minor' | 'patch',
                    }))
                  }
                  className="w-full px-3 py-2 border border-[color:var(--panel-border)] bg-[color:var(--panel-bg-alt)] text-[color:var(--text)] rounded-md focus:ring-primary focus:border-primary"
                >
                  <option value="patch">Patch (bug fixes, minor changes)</option>
                  <option value="minor">Minor (new features, improvements)</option>
                  <option value="major">Major (significant changes, breaking changes)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor={fieldIds.versionName}
                  className="block text-sm font-medium text-[color:var(--heading)] mb-2"
                >
                  Version Name
                </label>
                <input
                  type="text"
                  id={fieldIds.versionName}
                  value={newVersionData.name}
                  onChange={(e) => setNewVersionData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-[color:var(--panel-border)] bg-[color:var(--panel-bg-alt)] text-[color:var(--text)] rounded-md focus:ring-primary focus:border-primary"
                  placeholder="e.g., Updated Europe layout"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor={fieldIds.description}
                  className="block text-sm font-medium text-[color:var(--heading)] mb-2"
                >
                  Description (optional)
                </label>
                <textarea
                  id={fieldIds.description}
                  value={newVersionData.description}
                  onChange={(e) =>
                    setNewVersionData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-[color:var(--panel-border)] bg-[color:var(--panel-bg-alt)] text-[color:var(--text)] rounded-md focus:ring-primary focus:border-primary"
                  rows={2}
                  placeholder="Brief description of this version..."
                />
              </div>

              <div>
                <label
                  htmlFor={fieldIds.changelog}
                  className="block text-sm font-medium text-[color:var(--heading)] mb-2"
                >
                  Changelog
                </label>
                <textarea
                  id={fieldIds.changelog}
                  value={newVersionData.changelog}
                  onChange={(e) =>
                    setNewVersionData((prev) => ({ ...prev, changelog: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-[color:var(--panel-border)] bg-[color:var(--panel-bg-alt)] text-[color:var(--text)] rounded-md focus:ring-primary focus:border-primary"
                  rows={3}
                  placeholder="- Fixed territory adjacency issues&#10;- Improved continent balance&#10;- Added new special abilities"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-[color:var(--panel-border)] rounded-md text-[color:var(--text)] hover:bg-[color:var(--hover-bg)]"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateVersion}
                disabled={creating || !newVersionData.name.trim()}
                className="px-4 py-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create Version'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MapVersionManager
