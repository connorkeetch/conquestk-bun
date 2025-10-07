import { useEffect, useId, useRef, useState } from 'react'
import reportService from '@/services/reportService'

interface ReportUserModalProps {
  open: boolean
  onClose: () => void
  reportedUserId: string
  reportedUsername?: string
}

const REASONS = [
  { id: 'harassment', label: 'Harassment or hate' },
  { id: 'cheating', label: 'Cheating or unfair play' },
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'impersonation', label: 'Impersonation' },
  { id: 'other', label: 'Something else' },
]

export default function ReportUserModal({
  open,
  onClose,
  reportedUserId,
  reportedUsername,
}: ReportUserModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const reasonId = useId()
  const detailsId = useId()
  const [reason, setReason] = useState('harassment')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setError(null)
      setSubmitted(false)
      setSubmitting(false)
    }
  }, [open])

  const onSubmit = async () => {
    if (!reason) return
    setSubmitting(true)
    setError(null)
    try {
      await reportService.reportUser(reportedUserId, {
        reason,
        description: details.trim().slice(0, 4000) || undefined,
      })
      setSubmitted(true)
      setTimeout(() => onClose(), 900)
    } catch (_e) {
      setError('Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-xl shadow-2xl border border-white/10 bg-[color:var(--surface-1)] text-white overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[color:var(--surface-2)]/60">
          <h3 className="text-lg font-semibold">
            Report {reportedUsername ? `@${reportedUsername}` : 'User'}
          </h3>
          <button type="button" className="btn btn-tertiary btn-sm" onClick={onClose}>
            ✖ Close
          </button>
        </div>
        <div className="p-5 space-y-4">
          {submitted ? (
            <div className="panel-muted">Thank you. Your report was submitted for review.</div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-muted mb-1" htmlFor="report-reason">
                  Reason
                </label>
                <select
                  id={reasonId}
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted mb-1" htmlFor="report-details">
                  Details (optional)
                </label>
                <textarea
                  id={detailsId}
                  className="input min-h-[120px]"
                  placeholder="Add any context or examples (no links)"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  maxLength={4000}
                />
                <div className="text-xs text-muted mt-1">{details.length}/4000</div>
              </div>
              {error && <div className="text-[color:var(--color-danger)] text-sm">{error}</div>}
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="btn btn-tertiary btn-sm" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void onSubmit()}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting…' : 'Submit Report'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
