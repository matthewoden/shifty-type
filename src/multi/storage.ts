// localStorage for multiplayer: per-match auth (token + which slot you are),
// the active match code for Home's resume button, and the display name.

import type { PlayerId } from '../game'
import type { MatchSummary } from '../lib/protocol'

export interface MatchAuth {
  token: string
  you: PlayerId
}

const AUTH_PREFIX = 'wordchain.mp.'
const ACTIVE_KEY = 'wordchain.mp.active'
const NAME_KEY = 'wordchain.name'
const LOBBY_CACHE_KEY = 'wordchain.lobby.v1'

export function saveMatchAuth(code: string, auth: MatchAuth): void {
  localStorage.setItem(AUTH_PREFIX + code, JSON.stringify(auth))
  localStorage.setItem(ACTIVE_KEY, code)
}

export function loadMatchAuth(code: string): MatchAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_PREFIX + code)
    if (!raw) return null
    const auth = JSON.parse(raw) as MatchAuth
    return auth?.token && (auth.you === 'p1' || auth.you === 'p2') ? auth : null
  } catch {
    return null
  }
}

export function getActiveCode(): string | null {
  const code = localStorage.getItem(ACTIVE_KEY)
  return code && loadMatchAuth(code) ? code : null
}

export function clearActiveCode(): void {
  localStorage.removeItem(ACTIVE_KEY)
}

export interface Seat {
  code: string
  auth: MatchAuth
}

/** Every multiplayer seat this device holds — the lobby's work-list. */
export function listSeats(): Seat[] {
  const seats: Seat[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(AUTH_PREFIX)) continue
    const code = key.slice(AUTH_PREFIX.length)
    if (!CODE_RE.test(code)) continue // skips the 'active' pointer key
    const auth = loadMatchAuth(code)
    if (auth) seats.push({ code, auth })
  }
  return seats
}

/** Drop a seat whose match is gone (deleted after 60 days of silence). */
export function removeMatchAuth(code: string): void {
  localStorage.removeItem(AUTH_PREFIX + code)
  if (localStorage.getItem(ACTIVE_KEY) === code) localStorage.removeItem(ACTIVE_KEY)
}

// The last lobby snapshot, kept so the lobby (and Home's badge) paint instantly
// and survive an offline open; refreshed whenever the lobby fetches.
export function loadLobbyCache(): MatchSummary[] {
  try {
    const raw = localStorage.getItem(LOBBY_CACHE_KEY)
    const arr = raw ? JSON.parse(raw) : null
    return Array.isArray(arr) ? (arr as MatchSummary[]) : []
  } catch {
    return []
  }
}

export function saveLobbyCache(summaries: MatchSummary[]): void {
  try {
    localStorage.setItem(LOBBY_CACHE_KEY, JSON.stringify(summaries))
  } catch {
    // Storage full / disabled — the lobby just fetches fresh next time.
  }
}

export function getSavedName(): string {
  return localStorage.getItem(NAME_KEY) ?? ''
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name)
}

// ---- Seat links -----------------------------------------------------------
// On iOS, removing the installed app from the home screen also wipes its
// localStorage — and the match tokens in there ARE the player's seats. The
// seat link carries them in the URL fragment (never sent to the server) so
// delete-and-re-add (the notification-permission reset of last resort)
// doesn't cost the player their matches. ?install=1 lands them straight in
// the add-to-home-screen steps.

const CODE_RE = /^[A-Z0-9]{4}$/

interface SeatPayload {
  name?: string
  active?: string
  seats: Record<string, MatchAuth>
}

/** Everything that makes this device "you", packed into one copyable URL. */
export function buildSeatLink(): string {
  const seats: Record<string, MatchAuth> = {}
  for (const { code, auth } of listSeats()) seats[code] = auth
  const payload: SeatPayload = {
    name: getSavedName() || undefined,
    active: localStorage.getItem(ACTIVE_KEY) ?? undefined,
    seats,
  }
  // btoa chokes on non-latin1 (names are free text) — go through UTF-8 bytes.
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const b64 = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  return `https://${location.host}/?install=1#seats=${b64}`
}

/** Any multiplayer seats stored on this device? Gates the paste pill. */
export function hasAnySeats(): boolean {
  return listSeats().length > 0
}

function restoreSeatPayload(encoded: string): { restored: number; active: string | null } | null {
  try {
    const padded = encoded
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(encoded.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as SeatPayload
    let restored = 0
    for (const [code, auth] of Object.entries(payload.seats ?? {})) {
      if (CODE_RE.test(code) && typeof auth?.token === 'string' && auth.token) {
        saveMatchAuth(code, { token: auth.token, you: auth.you === 'p2' ? 'p2' : 'p1' })
        restored++
      }
    }
    if (restored === 0) return null
    // saveMatchAuth moves the active pointer as it goes — put it back last.
    const active =
      payload.active && CODE_RE.test(payload.active) && payload.seats?.[payload.active]
        ? payload.active
        : getActiveCode()
    if (active) localStorage.setItem(ACTIVE_KEY, active)
    if (typeof payload.name === 'string' && payload.name && !getSavedName())
      saveName(payload.name.slice(0, 20))
    return { restored, active }
  } catch {
    return null // truncated paste or garbage — a fresh start beats a crash
  }
}

/** Restore seats from pasted text (a full game link, or anything containing
 *  its fragment). Null when the text holds no usable seats. */
export function restoreSeatsFromText(text: string): { restored: number; active: string | null } | null {
  const m = text.match(/#seats=([A-Za-z0-9_-]+)/)
  return m ? restoreSeatPayload(m[1]) : null
}

/** Restore seats from a seat link in the address bar. Runs before React
 *  mounts so the app wakes up already seated; strips the fragment (but not
 *  ?install=1 — the install badge still wants it). */
export function consumeSeatLink(): void {
  const m = location.hash.match(/^#seats=([A-Za-z0-9_-]+)$/)
  if (!m) return
  restoreSeatPayload(m[1])
  history.replaceState(null, '', location.pathname + location.search)
}
