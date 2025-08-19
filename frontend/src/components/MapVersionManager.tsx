import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface MapVersion {
  id: string;
  mapId: string;
  versionNumber: string;
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
  isCurrent: boolean;
  statusId: string;
  name: string;
  description?: string;
  changelog?: string;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
  statusName?: string;
  statusColor?: string;
}

interface VersionCreationData {
  name: string;
  description: string;
  changelog: string;
  versionType: 'major' | 'minor' | 'patch';
  tags: string[];
}

export const MapVersionManager: React.FC = () => {
  const { mapId } = useParams<{ mapId: string }>();
  
  const [versions, setVersions] = useState<MapVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newVersionData, setNewVersionData] = useState<VersionCreationData>({
    name: '',
    description: '',
    changelog: '',
    versionType: 'patch',
    tags: []
  });

  useEffect(() => {
    if (mapId) {
      loadVersions();
    }
  }, [mapId]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/map-approval/maps/${mapId}/versions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load versions');
      }
      
      const data = await response.json();
      setVersions(data.versions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    try {
      setCreating(true);
      setError(null);
      
      const response = await fetch(`/api/map-approval/maps/${mapId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newVersionData)
      });
      
      if (!response.ok) {
        throw new Error('Failed to create version');
      }
      
      // Reset form and close modal
      setNewVersionData({
        name: '',
        description: '',
        changelog: '',
        versionType: 'patch',
        tags: []
      });
      setShowCreateModal(false);
      
      // Reload versions
      await loadVersions();
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleSetCurrent = async (versionId: string) => {
    try {
      const response = await fetch(`/api/map-approval/versions/${versionId}/current`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to set current version');
      }
      
      await loadVersions();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSubmitForApproval = async (versionId: string) => {
    try {
      const submissionNotes = prompt('Optional notes for the reviewers:');
      
      const response = await fetch(`/api/map-approval/versions/${versionId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ submissionNotes })
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit for approval');
      }
      
      await loadVersions();
      alert('Version submitted for approval! You will be notified once it has been reviewed.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getStatusBadge = (version: MapVersion) => {
    const getStatusColor = (statusName: string) => {
      switch (statusName) {
        case 'draft': return 'bg-gray-100 text-gray-800';
        case 'submitted': return 'bg-blue-100 text-blue-800';
        case 'under_review': return 'bg-yellow-100 text-yellow-800';
        case 'approved': return 'bg-green-100 text-green-800';
        case 'published': return 'bg-green-200 text-green-900 font-semibold';
        case 'rejected': return 'bg-red-100 text-red-800';
        case 'archived': return 'bg-gray-200 text-gray-600';
        default: return 'bg-gray-100 text-gray-800';
      }
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        getStatusColor(version.statusName || '')
      }`}>
        {version.statusName?.replace('_', ' ')}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading versions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Version Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage different versions of your map and track their approval status
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          Create New Version
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="text-red-400 mr-3">⚠️</div>
            <div>
              <h3 className="text-red-800 font-medium">Error</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Versions List */}
      <div className="bg-slate-800 rounded-lg shadow-sm border border-slate-600">
        {versions.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-gray-400 text-6xl mb-4">📝</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Versions Yet</h3>
            <p className="text-gray-600 mb-6">
              Create your first version to start managing your map's development.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              Create Version 1.0.0
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Published
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-slate-800 divide-y divide-slate-600">
                {versions.map((version) => (
                  <tr key={version.id} className={version.isCurrent ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          v{version.versionNumber}
                        </div>
                        {version.isCurrent && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            Current
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {version.name}
                        </div>
                        {version.description && (
                          <div className="text-sm text-gray-500">
                            {version.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(version)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {formatDate(version.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {version.publishedAt ? formatDate(version.publishedAt) : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        {!version.isCurrent && version.statusName === 'published' && (
                          <button
                            onClick={() => handleSetCurrent(version.id)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Set Current
                          </button>
                        )}
                        {version.statusName === 'draft' && (
                          <button
                            onClick={() => handleSubmitForApproval(version.id)}
                            className="text-green-600 hover:text-green-800 text-sm font-medium"
                          >
                            Submit for Approval
                          </button>
                        )}
                        <button className="text-gray-600 hover:text-gray-800 text-sm font-medium">
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
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Create New Version
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Version Type
                </label>
                <select
                  value={newVersionData.versionType}
                  onChange={(e) => setNewVersionData(prev => ({ 
                    ...prev, 
                    versionType: e.target.value as 'major' | 'minor' | 'patch'
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="patch">Patch (bug fixes, minor changes)</option>
                  <option value="minor">Minor (new features, improvements)</option>
                  <option value="major">Major (significant changes, breaking changes)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Version Name
                </label>
                <input
                  type="text"
                  value={newVersionData.name}
                  onChange={(e) => setNewVersionData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Updated Europe layout"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={newVersionData.description}
                  onChange={(e) => setNewVersionData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder="Brief description of this version..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Changelog
                </label>
                <textarea
                  value={newVersionData.changelog}
                  onChange={(e) => setNewVersionData(prev => ({ ...prev, changelog: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="- Fixed territory adjacency issues&#10;- Improved continent balance&#10;- Added new special abilities"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateVersion}
                disabled={creating || !newVersionData.name.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create Version'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapVersionManager;