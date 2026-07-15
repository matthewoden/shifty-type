// Thin client for the match API. Every call can fail on hospital wifi, so
// network errors resolve to a friendly ApiError instead of throwing.

import type {
  ClientMove,
  CreateResponse,
  GetResponse,
  JoinResponse,
  MatchesSummaryResponse,
  MoveResponse,
  PreviewResponse,
} from './protocol'

const OFFLINE_ERROR = "Can't reach the game — check your signal and try again."

async function req<T extends { ok: boolean }>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T | { ok: false; error: string; offline: true }> {
  try {
    const res = await fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.token ? { 'x-match-token': options.token } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15000),
    })
    return (await res.json()) as T
  } catch {
    return { ok: false, error: OFFLINE_ERROR, offline: true }
  }
}

export const api = {
  create(name: string) {
    return req<CreateResponse>('/api/match', { method: 'POST', body: { name } })
  },
  join(code: string, name: string) {
    return req<JoinResponse>(`/api/match/${code}/join`, { method: 'POST', body: { name } })
  },
  preview(code: string) {
    return req<PreviewResponse>(`/api/match/${code}/preview`)
  },
  matchesSummary(matches: { code: string; token: string }[]) {
    return req<MatchesSummaryResponse>('/api/matches/summary', { method: 'POST', body: { matches } })
  },
  get(code: string, token: string, since?: number) {
    const qs = since !== undefined ? `?since=${since}` : ''
    return req<GetResponse>(`/api/match/${code}${qs}`, { token })
  },
  move(code: string, token: string, move: ClientMove) {
    return req<MoveResponse>(`/api/match/${code}/move`, {
      method: 'POST',
      token,
      body: { move },
    })
  },
  rematch(code: string, token: string) {
    return req<MoveResponse>(`/api/match/${code}/rematch`, { method: 'POST', token })
  },
  pushKey() {
    return req<{ ok: true; key: string | null }>('/api/push/key')
  },
  setPush(code: string, token: string, subscription: unknown) {
    return req<{ ok: true }>(`/api/match/${code}/push`, {
      method: 'POST',
      token,
      body: { subscription },
    })
  },
}
