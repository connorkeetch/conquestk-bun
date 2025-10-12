import crypto from 'node:crypto'

export type PresenceOnlineRequest = { user_id: string; connection_id: string; room_id?: string }
export type PresenceOfflineRequest = { user_id: string; connection_id: string }
export type PresenceMoveRequest = { user_id: string; from_room_id?: string; to_room_id?: string }

export type EnqueueRequest = {
  user_id: string
  mode: string
  party_id?: string
  elo?: number
  map_prefs?: string[]
  timeout_s?: number
}
export type EnqueueResponse = { ticket_id: string }
export type DequeueRequest = { ticket_id: string }
export type PollResponse = {
  status: 'PENDING' | 'FOUND' | 'EXPIRED'
  match_id?: string
  players?: string[]
  mode?: string
}

export interface MatchSvcClientOptions {
  baseUrl?: string // default http://localhost:8085
  hmacSecret?: string // required in prod
  fetchImpl?: typeof fetch
}

export class MatchSvcClient {
  private baseUrl: string
  private hmacSecret?: string
  private fetchImpl: typeof fetch

  constructor(opts: MatchSvcClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.MATCHSVC_URL ?? 'http://localhost:8085'
    this.hmacSecret = opts.hmacSecret ?? process.env.MATCHSVC_HMAC_SECRET
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  async presenceOnline(req: PresenceOnlineRequest) {
    return this.post('/v1/presence/online', req)
  }
  async presenceOffline(req: PresenceOfflineRequest) {
    return this.post('/v1/presence/offline', req)
  }
  async presenceMove(req: PresenceMoveRequest) {
    return this.post('/v1/presence/move', req)
  }
  async enqueue(req: EnqueueRequest): Promise<EnqueueResponse> {
    return this.post('/v1/queue/enqueue', req)
  }
  async dequeue(ticket_id: string) {
    return this.post('/v1/queue/dequeue', { ticket_id })
  }
  async poll(ticket_id: string): Promise<PollResponse> {
    return this.get(`/v1/queue/${ticket_id}`)
  }
  async getMatch(matchId: string) {
    return this.get(`/v1/match/${matchId}`)
  }
  async getRating(mode: string, userId: string) {
    return this.get(`/v1/ratings/${mode}/${userId}`)
  }
  async reportResult(body: unknown) {
    return this.post('/v1/results', body)
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const json = JSON.stringify(body)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.hmacSecret) headers['X-MatchSvc-Signature'] = hmacSha256Hex(json, this.hmacSecret)
    const res = await this.fetchImpl(this.baseUrl + path, { method: 'POST', headers, body: json })
    if (!res.ok) throw new Error(`matchsvc ${path} ${res.status}`)
    return (await res.json()) as T
  }
  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + path)
    if (!res.ok) throw new Error(`matchsvc ${path} ${res.status}`)
    return (await res.json()) as T
  }
}

export function hmacSha256Hex(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex')
}
