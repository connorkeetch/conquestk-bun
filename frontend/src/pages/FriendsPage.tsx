import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/services/api'
import friendsService, {
  type FriendRequestsResponse,
  type FriendSummary,
} from '@/services/friendsService'
import { logger } from '@/utils/logger'
import { socketService } from '@/services/socketService'

type LoadState = 'idle' | 'loading' | 'error'

interface UserProfileLookup {
  id: string
  username: string
}

export default function FriendsPage() {
  const [friends, setFriends] = useState<FriendSummary[]>([])
  const [requests, setRequests] = useState<FriendRequestsResponse>({ incoming: [], outgoing: [] })
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [usernameToAdd, setUsernameToAdd] = useState('')
  const [suggestions, setSuggestions] = useState<UserProfileLookup[]>([])
  const [actionBusy, setActionBusy] = useState<string>('')

  const load = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const [f, r] = await Promise.all([friendsService.listFriends(), friendsService.listRequests()])
      setFriends(f)
      setRequests(r)
      setState('idle')
    } catch (e) {
      logger.error('Failed to load friends', e)
      setError('Failed to load friends data')
      setState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const hasAny = useMemo(() => {
    return friends.length > 0 || requests.incoming.length > 0 || requests.outgoing.length > 0
  }, [friends, requests])

  const lookupUserByUsername = async (username: string): Promise<UserProfileLookup | null> => {
    try {
      const res = await api.get(`/users/${encodeURIComponent(username)}/profile`)
      return { id: res.data.id, username: res.data.username } as UserProfileLookup
    } catch (e) {
      return null
    }
  }

  // Autocomplete suggestions as user types
  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      const q = usernameToAdd.trim()
      if (q.length < 2) {
        setSuggestions([])
        return
      }
      try {
        const res = await api.get('/users/search', {
          params: { q, limit: 8 },
          signal: controller.signal,
        })
        setSuggestions(res.data.users ?? [])
      } catch {
        setSuggestions([])
      }
    }
    void run()
    return () => controller.abort()
  }, [usernameToAdd])

  const onSendRequest = async () => {
    const name = usernameToAdd.trim()
    if (!name) return
    setActionBusy('send')
    try {
      const profile = await lookupUserByUsername(name)
      if (!profile) {
        setError('User not found')
        return
      }
      await friendsService.sendRequest(profile.id)
      setUsernameToAdd('')
      await load()
    } catch (e) {
      logger.error('Failed to send friend request', e)
      setError('Failed to send friend request')
    } finally {
      setActionBusy('')
    }
  }

  const accept = async (requesterId: string) => {
    setActionBusy(`accept:${requesterId}`)
    try {
      await friendsService.accept(requesterId)
      await load()
    } catch (e) {
      setError('Failed to accept request')
    } finally {
      setActionBusy('')
    }
  }

  const decline = async (requesterId: string) => {
    setActionBusy(`decline:${requesterId}`)
    try {
      await friendsService.decline(requesterId)
      await load()
    } catch (e) {
      setError('Failed to decline request')
    } finally {
      setActionBusy('')
    }
  }

  const cancel = async (targetUserId: string) => {
    setActionBusy(`cancel:${targetUserId}`)
    try {
      await friendsService.cancel(targetUserId)
      await load()
    } catch (e) {
      setError('Failed to cancel request')
    } finally {
      setActionBusy('')
    }
  }

  const unfriend = async (friendId: string) => {
    setActionBusy(`unfriend:${friendId}`)
    try {
      await friendsService.unfriend(friendId)
      await load()
    } catch (e) {
      setError('Failed to remove friend')
    } finally {
      setActionBusy('')
    }
  }

  // Live refresh via socket
  useEffect(() => {
    const refresh = () => void load()
    socketService.io?.on('friend.request.received', refresh)
    socketService.io?.on('friend.request.accepted', refresh)
    socketService.io?.on('friend.request.declined', refresh)
    socketService.io?.on('friend.request.cancelled', refresh)
    socketService.io?.on('friend.added', refresh)
    socketService.io?.on('friend.removed', refresh)
    return () => {
      socketService.io?.off('friend.request.received', refresh)
      socketService.io?.off('friend.request.accepted', refresh)
      socketService.io?.off('friend.request.declined', refresh)
      socketService.io?.off('friend.request.cancelled', refresh)
      socketService.io?.off('friend.added', refresh)
      socketService.io?.off('friend.removed', refresh)
    }
  }, [load])

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10 text-primary-soft">👫</div>
        <h1 className="text-2xl font-semibold text-white">Friends</h1>
      </div>

      <div className="glass-box-lg p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input
            className="input"
            placeholder="Add by username"
            value={usernameToAdd}
            onChange={(e) => setUsernameToAdd(e.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={onSendRequest} disabled={actionBusy === 'send'}>
            {actionBusy === 'send' ? 'Sending…' : 'Send Friend Request'}
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-surface-2 divide-y divide-border">
            {suggestions.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-white">{u.username}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    setUsernameToAdd('')
                    setSuggestions([])
                    await friendsService.sendRequest(u.id)
                    await load()
                  }}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="glass-box-sm p-3 mb-4 border border-red-500/40 text-red-200">{error}</div>
      )}

      {!hasAny && state !== 'loading' && (
        <div className="glass-box-lg p-12 text-center text-muted">No friends or requests yet</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 glass-box-lg p-4">
          <h2 className="text-white font-semibold mb-3">Your Friends</h2>
          {state === 'loading' ? (
            <div className="text-muted p-6">Loading…</div>
          ) : friends.length === 0 ? (
            <div className="text-muted p-6">No friends yet</div>
          ) : (
            <ul className="divide-y divide-border">
              {friends.map((f) => (
                <li key={f.userId} className="flex items-center justify-between py-3">
                  <div className="text-white">{f.username}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => unfriend(f.userId)}
                      disabled={actionBusy === `unfriend:${f.userId}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-box-lg p-4">
          <h2 className="text-white font-semibold mb-3">Requests</h2>
          <div>
            <h3 className="text-muted text-sm mb-2">Incoming</h3>
            {requests.incoming.length === 0 ? (
              <div className="text-muted text-sm mb-4">None</div>
            ) : (
              <ul className="space-y-2 mb-4">
                {requests.incoming.map((r) => (
                  <li key={r.requesterId} className="flex items-center justify-between">
                    <span className="text-white">{r.requesterName}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => accept(r.requesterId)}
                        disabled={actionBusy === `accept:${r.requesterId}`}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => decline(r.requesterId)}
                        disabled={actionBusy === `decline:${r.requesterId}`}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="text-muted text-sm mb-2">Sent</h3>
            {requests.outgoing.length === 0 ? (
              <div className="text-muted text-sm">None</div>
            ) : (
              <ul className="space-y-2">
                {requests.outgoing.map((r) => (
                  <li key={r.requesterId} className="flex items-center justify-between">
                    <span className="text-white">{r.requesterName}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => cancel(r.requesterId)}
                      disabled={actionBusy === `cancel:${r.requesterId}`}
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
