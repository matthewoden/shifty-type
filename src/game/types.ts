// Core types for Word Chain. This module must stay dependency-free:
// it is imported by both the React client and the MatchDO Durable Object.

export type PlayerId = 'p1' | 'p2'

export interface Player {
  id: PlayerId
  name: string
  gold: number
  lives: number
}

/** One word on the chain. */
export interface ChainLink {
  word: string
  owner: PlayerId
  /** Letters shared with the previous word (0 for the opener). */
  overlap: number
  /** Gold earned by this word: overlap² + max(0, length − 6). 0 for the opener. */
  gold: number
  /** Set once the word has survived a challenge. */
  challengeSurvived?: boolean
}

/** See GAME_DESIGN.md §States. */
export type MatchPhase =
  | 'P1_TURN'
  | 'P2_TURN'
  | 'CHALLENGE_PENDING'
  | 'VAULT_CLOSED'
  | 'GAME_OVER'

export type Move =
  | { type: 'play'; word: string }
  | { type: 'pass' }
  | { type: 'challenge' }
  | { type: 'fold' }
  /**
   * The engine is pure, so the referee's verdict is an input: the caller
   * (Durable Object in multiplayer, solo controller vs the bot) checks the
   * embedded list / dictionary API first, then applies stand with the result.
   */
  | { type: 'stand'; wordIsReal: boolean }

export interface MatchState {
  phase: MatchPhase
  players: Record<PlayerId, Player>
  chain: ChainLink[]
  /**
   * Every word ever accepted, including words later removed by a fold or a
   * failed stand — no word may repeat within a match, even a busted fake.
   */
  usedWords: string[]
  /** Who challenged, while phase is CHALLENGE_PENDING. */
  challenger: PlayerId | null
  /** Winner, once phase is VAULT_CLOSED or GAME_OVER. Null on gold tie… which tiebreaks prevent. */
  winner: PlayerId | null
  /** Monotonic counter, bumped on every applied move; used for cheap polling. */
  version: number
  /** Words in a full chain. Absent = CHAIN_LIMIT; the tutorial plays short matches. */
  chainLimit?: number
  /**
   * True while the second seat is still empty: the opener plays and shares
   * the invite, and the match waits (possibly mid-turn) for a friend to join.
   * Cleared by joinMatch. Absent in solo play (both seats filled at create).
   */
  awaitingOpponent?: boolean
}

export const STARTING_LIVES = 3
export const CHAIN_LIMIT = 20
export const MIN_WORD_LENGTH = 3
export const MAX_WORD_LENGTH = 12
export const MIN_OVERLAP = 2
