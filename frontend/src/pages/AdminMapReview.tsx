import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface ReviewCriteria {
  id: string;
  name: string;
  description: string;
  category: string;
  isRequired: boolean;
  weight: number;
}

interface ReviewResult {
  criteriaId: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  reviewerNotes?: string;
}

interface ApprovalRequest {
  id: string;
  versionId: string;
  requesterId: string;
  submissionNotes?: string;
  priorityLevel: string;
  createdAt: string;
  versionName: string;
  versionNumber: string;
  requesterUsername: string;
}

export const AdminMapReview: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);
  const [criteria, setCriteria] = useState<ReviewCriteria[]>([]);
  const [reviewResults, setReviewResults] = useState<ReviewResult[]>([]);
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'needs_changes'>('approved');
  const [moderatorFeedback, setModeratorFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requestId) {
      loadData();
    }
  }, [requestId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load approval request details
      const requestResponse = await fetch(`/api/map-approval/approval-requests/${requestId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!requestResponse.ok) {
        throw new Error('Failed to load approval request');
      }
      
      const requestData = await requestResponse.json();
      setApprovalRequest(requestData.approvalRequest);
      
      // Load review criteria
      const criteriaResponse = await fetch('/api/map-approval/review-criteria', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!criteriaResponse.ok) {
        throw new Error('Failed to load review criteria');
      }
      
      const criteriaData = await criteriaResponse.json();
      setCriteria(criteriaData.criteria);
      
      // Initialize review results
      const initialResults = criteriaData.criteria.map((criterion: ReviewCriteria) => ({
        criteriaId: criterion.id,
        status: 'pass' as const,
        reviewerNotes: ''
      }));
      
      setReviewResults(initialResults);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateReviewResult = (criteriaId: string, field: keyof ReviewResult, value: any) => {
    setReviewResults(prev => prev.map(result => 
      result.criteriaId === criteriaId 
        ? { ...result, [field]: value }
        : result
    ));
  };

  const handleSubmitReview = async () => {
    try {
      setSubmitting(true);
      setError(null);
      
      // Validate required criteria
      const requiredCriteria = criteria.filter(c => c.isRequired);
      const failedRequired = reviewResults.filter(r => {
        const criterion = criteria.find(c => c.id === r.criteriaId);
        return criterion?.isRequired && r.status === 'fail';
      });
      
      if (failedRequired.length > 0 && decision === 'approved') {
        setError('Cannot approve map with failed required criteria. Please change decision to rejected or needs_changes.');
        return;
      }
      
      const response = await fetch(`/api/map-approval/approval-requests/${requestId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          results: reviewResults,
          decision,
          moderatorFeedback
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit review');
      }
      
      // Navigate back to review queue
      navigate('/admin/map-reviews');
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass': return 'text-green-600 bg-green-50 border-green-200';
      case 'fail': return 'text-red-600 bg-red-50 border-red-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'not_applicable': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'technical': return 'bg-blue-100 text-blue-800';
      case 'gameplay': return 'bg-purple-100 text-purple-800';
      case 'content': return 'bg-green-100 text-green-800';
      case 'visual': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading review data...</p>
        </div>
      </div>
    );
  }

  if (error && !approvalRequest) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="text-red-400 mr-3">⚠️</div>
            <div>
              <h3 className="text-red-800 font-medium">Error Loading Review</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Map Review</h1>
            <p className="text-gray-600 mt-1">
              Review submission for approval and publication
            </p>
          </div>
          <button
            onClick={() => navigate('/admin/map-reviews')}
            className="text-gray-600 hover:text-gray-800 font-medium"
          >
            ← Back to Review Queue
          </button>
        </div>
      </div>

      {/* Map Information */}
      {approvalRequest && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Submission Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Map Name</label>
              <p className="mt-1 text-gray-900">{approvalRequest.versionName}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Version</label>
              <p className="mt-1 text-gray-900">{approvalRequest.versionNumber}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Creator</label>
              <p className="mt-1 text-gray-900">{approvalRequest.requesterUsername}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Priority</label>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                approvalRequest.priorityLevel === 'high' ? 'bg-red-100 text-red-800' :
                approvalRequest.priorityLevel === 'urgent' ? 'bg-red-200 text-red-900' :
                'bg-blue-100 text-blue-800'
              }`}>
                {approvalRequest.priorityLevel}
              </span>
            </div>
            {approvalRequest.submissionNotes && (
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-700">Submission Notes</label>
                <p className="mt-1 text-gray-900 bg-gray-50 p-3 rounded-md">
                  {approvalRequest.submissionNotes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review Criteria */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Review Criteria</h2>
        
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="text-red-400 mr-3">⚠️</div>
              <div>
                <h3 className="text-red-800 font-medium">Review Error</h3>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {criteria.map((criterion) => {
            const result = reviewResults.find(r => r.criteriaId === criterion.id);
            
            return (
              <div key={criterion.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="font-medium text-gray-900">{criterion.name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(criterion.category)}`}>
                        {criterion.category}
                      </span>
                      {criterion.isRequired && (
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{criterion.description}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Review Status
                    </label>
                    <select
                      value={result?.status || 'pass'}
                      onChange={(e) => updateReviewResult(criterion.id, 'status', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                        result?.status ? getStatusColor(result.status) : 'border-gray-300'
                      }`}
                    >
                      <option value="pass">✅ Pass</option>
                      <option value="fail">❌ Fail</option>
                      <option value="warning">⚠️ Warning</option>
                      <option value="not_applicable">➖ Not Applicable</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reviewer Notes (optional)
                    </label>
                    <textarea
                      value={result?.reviewerNotes || ''}
                      onChange={(e) => updateReviewResult(criterion.id, 'reviewerNotes', e.target.value)}
                      placeholder="Add notes about this criterion..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Final Decision */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Final Decision</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Decision
            </label>
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as any)}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="approved">✅ Approve for Publication</option>
              <option value="needs_changes">⚠️ Needs Changes (Return to Draft)</option>
              <option value="rejected">❌ Reject Submission</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Feedback for Creator {decision !== 'approved' && '(Required)'}
            </label>
            <textarea
              value={moderatorFeedback}
              onChange={(e) => setModeratorFeedback(e.target.value)}
              placeholder={
                decision === 'approved' 
                  ? 'Optional feedback for the creator...'
                  : 'Please provide specific feedback about what needs to be changed or why this was rejected...'
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              rows={4}
              required={decision !== 'approved'}
            />
          </div>
        </div>
      </div>

      {/* Submit Review */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Once submitted, the creator will be notified of the decision and any feedback provided.
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={() => navigate('/admin/map-reviews')}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitReview}
              disabled={submitting || (decision !== 'approved' && !moderatorFeedback.trim())}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminMapReview;