import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface ApprovalRequest {
  id: string;
  versionId: string;
  requesterId: string;
  assignedModeratorId?: string;
  submissionNotes?: string;
  priorityLevel: string;
  estimatedReviewTime?: number;
  reviewStartedAt?: string;
  createdAt: string;
  versionName: string;
  versionNumber: string;
  requesterUsername: string;
  assignedModeratorUsername?: string;
}

interface ApprovalStats {
  total_requests: number;
  approved: number;
  rejected: number;
  pending: number;
  avg_review_hours: number;
}

export const AdminMapReviews: React.FC = () => {
  const navigate = useNavigate();
  
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'assign' | 'priority' | ''>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load pending approval requests
      const requestsResponse = await fetch('/api/map-approval/approval-requests', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!requestsResponse.ok) {
        throw new Error('Failed to load approval requests');
      }
      
      const requestsData = await requestsResponse.json();
      setApprovalRequests(requestsData.requests || []);
      
      // Load approval statistics
      const statsResponse = await fetch('/api/map-approval/stats/approvals', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.stats);
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignToSelf = async (requestId: string) => {
    try {
      const response = await fetch(`/api/map-approval/approval-requests/${requestId}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to assign request');
      }
      
      // Reload data to reflect changes
      await loadData();
      
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRequestSelection = (requestId: string, selected: boolean) => {
    const newSelection = new Set(selectedRequests);
    if (selected) {
      newSelection.add(requestId);
    } else {
      newSelection.delete(requestId);
    }
    setSelectedRequests(newSelection);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedRequests(new Set(approvalRequests.map(r => r.id)));
    } else {
      setSelectedRequests(new Set());
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'normal': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${Math.floor(diffInHours / 24)}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading review queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Map Review Queue</h1>
            <p className="text-gray-600 mt-1">
              Review and approve submitted maps for publication
            </p>
          </div>
          <Link
            to="/admin"
            className="text-gray-600 hover:text-gray-800 font-medium"
          >
            ← Back to Admin Dashboard
          </Link>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl font-bold text-blue-600">{stats.pending || 0}</div>
            <div className="text-sm font-medium text-gray-600">Pending Reviews</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl font-bold text-green-600">{stats.approved || 0}</div>
            <div className="text-sm font-medium text-gray-600">Approved (30d)</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl font-bold text-red-600">{stats.rejected || 0}</div>
            <div className="text-sm font-medium text-gray-600">Rejected (30d)</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl font-bold text-gray-600">{stats.total_requests || 0}</div>
            <div className="text-sm font-medium text-gray-600">Total (30d)</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl font-bold text-purple-600">
              {stats.avg_review_hours ? Math.round(stats.avg_review_hours) : 0}h
            </div>
            <div className="text-sm font-medium text-gray-600">Avg Review Time</div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="text-red-400 mr-3">⚠️</div>
            <div>
              <h3 className="text-red-800 font-medium">Error Loading Reviews</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Review Queue */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Reviews ({approvalRequests.length})
            </h2>
            
            {selectedRequests.size > 0 && (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-600">
                  {selectedRequests.size} selected
                </span>
                <select
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value as any)}
                  className="px-3 py-1 border border-gray-300 rounded text-sm"
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
            <div className="text-gray-400 text-6xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Pending Reviews
            </h3>
            <p className="text-gray-600">
              All maps have been reviewed! Check back later for new submissions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedRequests.size === approvalRequests.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Map
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Creator
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {approvalRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedRequests.has(request.id)}
                        onChange={(e) => handleRequestSelection(request.id, e.target.checked)}
                        className="rounded border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {request.versionName}
                        </div>
                        <div className="text-sm text-gray-500">
                          v{request.versionNumber}
                        </div>
                        {request.submissionNotes && (
                          <div className="text-xs text-gray-400 mt-1 max-w-xs truncate">
                            "{request.submissionNotes}"
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{request.requesterUsername}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        getPriorityColor(request.priorityLevel)
                      }`}>
                        {request.priorityLevel}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {getTimeAgo(request.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {request.assignedModeratorId ? (
                        <div className="flex items-center">
                          <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                          <span className="text-sm text-gray-900">
                            {request.assignedModeratorUsername || 'Assigned'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
                          <span className="text-sm text-gray-500">Unassigned</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        {!request.assignedModeratorId && (
                          <button
                            onClick={() => handleAssignToSelf(request.id)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Assign to Me
                          </button>
                        )}
                        <Link
                          to={`/admin/map-review/${request.id}`}
                          className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => navigate('/admin/map-review-criteria')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
          >
            <div className="text-sm font-medium text-gray-900">Review Criteria</div>
            <div className="text-xs text-gray-500 mt-1">
              Manage standardized review criteria
            </div>
          </button>
          
          <button
            onClick={() => navigate('/admin/maps')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
          >
            <div className="text-sm font-medium text-gray-900">All Maps</div>
            <div className="text-xs text-gray-500 mt-1">
              View and manage all maps in the system
            </div>
          </button>
          
          <button
            onClick={() => navigate('/admin/map-analytics')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
          >
            <div className="text-sm font-medium text-gray-900">Analytics</div>
            <div className="text-xs text-gray-500 mt-1">
              View map usage and review statistics
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminMapReviews;