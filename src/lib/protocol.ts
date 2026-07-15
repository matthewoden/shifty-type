// Wire types shared by the client and the Worker/Durable Object.

import type { MatchPhase, MatchState, PlayerId } from '../game'

/**
 * What just happened, so clients can narrate it (toasts, verdict stamps)
 * without diffing states. 'fold'/'real'/'fake' carry the defender in `by`.
 */
export type LastEvent =
  | { kind: 'play'; word: string; by: PlayerId }
  | { kind: 'pass'; by: PlayerId }
  | { kind: 'challenge'; word: string; by: PlayerId }
  | { kind: 'fold'; word: string; by: PlayerId }
  | { kind: 'real'; word: string; by: PlayerId; coinFlip?: boolean }
  | { kind: 'fake'; word: string; by: PlayerId; coinFlip?: boolean }
  | { kind: 'rematch'; by: PlayerId }

/** Who has a live socket open right now. Ephemeral — never stored, never
 *  part of `revision`; it decorates views at read/push time. */
export interface Presence {
  p1: boolean
  p2: boolean
}

/**
 * What a client is allowed to see: its own identity plus the public state.
 * Player tokens never appear here — the DO redacts by construction.
 */
export interface MatchView {
  code: string
  you: PlayerId
  state: MatchState
  /** True while a stood challenge couldn't reach the dictionary — coin-flip time. */
  refereeOffline: boolean
  /** DO-level change counter (state + flags); the `since` for cheap polls. */
  revision: number
  lastEvent: LastEvent | null
  presence: Presence
}

/**
 * Moves as clients send them. 'stand' carries no verdict — the DO is the
 * referee and resolves it (embedded list → dictionary API). 'coinflip' is
 * the shared fallback when the referee is offline; either player may tap it.
 */
export type ClientMove =
  | { type: 'play'; word: string }
  | { type: 'pass' }
  | { type: 'challenge' }
  | { type: 'fold' }
  | { type: 'stand' }
  | { type: 'coinflip' }

export type ApiError = { ok: false; error: string }
export type CreateResponse = { ok: true; code: string; token: string; view: MatchView } | ApiError
export type JoinResponse = { ok: true; token: string; view: MatchView } | ApiError
export type GetResponse =
  | { ok: true; unchanged: true; presence: Presence }
  | { ok: true; unchanged?: false; view: MatchView }
  | ApiError

/**
 * Everything the DO pushes down a live socket is a full per-player view —
 * one message shape, and `revision` dedupes against HTTP responses. Upstream
 * the client only ever sends the text 'ping'; the runtime answers 'pong'
 * without waking the DO. Moves stay on HTTP POST.
 */
export type SocketPush = { type: 'view'; view: MatchView }

/**
 * What rides inside a Web Push message, DO → service worker. `tag` overrides
 * the default per-match notification tag ('match-CODE'); the quiet-match
 * reminders share 'quiet-matches' so a batch of them collapses into one
 * lock-screen card instead of ringing once per abandoned match.
 */
export interface NudgePayload {
  title: string
  body: string
  code: string
  tag?: string
}
export type MoveResponse =
  | { ok: true; view: MatchView; refereeOffline?: boolean }
  | ApiError

/**
 * Public, tokenless facts for the invite landing screen: who's inviting, the
 * word already on the table (null if they haven't opened yet), and whether a
 * seat is still open to join.
 */
export type PreviewResponse =
  | { ok: true; creatorName: string; openingWord: string | null; joinable: boolean }
  | ApiError

/**
 * A compact, redacted snapshot of one match for the lobby list — everything a
 * row needs to render without pulling the whole state (small payloads matter
 * on hospital wifi). `opponentName` is null while the second seat is still
 * empty; `lastMoveAt` is ms-epoch of the last activity (create/join/move).
 */
export interface MatchSummary {
  code: string
  you: PlayerId
  yourName: string
  opponentName: string | null
  phase: MatchPhase
  /** True when the next move is this device's to make. */
  yourTurn: boolean
  awaitingOpponent: boolean
  yourScore: number
  opponentScore: number
  winner: PlayerId | null
  lastMoveAt: number | null
  /** The opponent has a live socket open right now. */
  opponentPresent: boolean
  /** The first word on the chain — for the pending-invite subtitle and share. */
  openingWord: string | null
}

/**
 * The lobby's one batched read: the client hands over the {code, token} seats
 * it already holds, the Worker fans out to each match DO. `gone` lists codes
 * whose match no longer exists (deleted after 60 days of silence) so the
 * client can prune those dead seats from localStorage.
 */
export type MatchesSummaryResponse =
  | { ok: true; summaries: MatchSummary[]; gone: string[] }
  | ApiError
