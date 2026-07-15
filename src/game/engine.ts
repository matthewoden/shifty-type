// Word Chain rules engine. Pure functions only — no dictionary, no network,
// no randomness. Runs identically in the browser and the Durable Object.

import {
  CHAIN_LIMIT,
  MAX_WORD_LENGTH,
  MIN_OVERLAP,
  MIN_WORD_LENGTH,
  STARTING_LIVES,
  type MatchPhase,
  type MatchState,
  type Move,
  type PlayerId,
} from './types'

export type MoveResult = { ok: true; state: MatchState } | { ok: false; error: string }

const WORD_RE = new RegExp(`^[a-z]{${MIN_WORD_LENGTH},${MAX_WORD_LENGTH}}$`)

export function opponentOf(id: PlayerId): PlayerId {
  return id === 'p1' ? 'p2' : 'p1'
}

function turnPhaseOf(id: PlayerId): MatchPhase {
  return id === 'p1' ? 'P1_TURN' : 'P2_TURN'
}

/** Gold stolen by a word: overlap² + 1 per letter beyond 6. */
export function goldFor(overlap: number, wordLength: number): number {
  return overlap * overlap + Math.max(0, wordLength - 6)
}

/**
 * Longest k where the last k letters of prev equal the first k letters of
 * next. k ranges from MIN_OVERLAP up to the full previous word — but the
 * full word only counts when next is strictly longer (prev must be a
 * proper prefix: ultra → ultramarine). Returns 0 when no valid overlap.
 */
export function overlapOf(prev: string, next: string): number {
  const max = Math.min(prev.length, next.length)
  for (let k = max; k >= MIN_OVERLAP; k--) {
    if (k === prev.length && next.length <= prev.length) continue
    if (prev.slice(-k) === next.slice(0, k)) return k
  }
  return 0
}

/** All suffixes of prev a next word may start with, shortest first. */
export function validSuffixes(prev: string): string[] {
  const out: string[] = []
  for (let k = MIN_OVERLAP; k <= prev.length; k++) out.push(prev.slice(-k))
  return out
}

/**
 * The grip a partially-typed word is reaching for: the deepest k whose
 * suffix is consistent with what's typed so far (the whole suffix once
 * typed is long enough, a prefix of it while still short). 0 = no valid
 * grip. Display-only — submission is judged by overlapOf.
 */
export function provisionalGrip(prev: string, typed: string): number {
  if (!typed) return 0
  for (let k = prev.length; k >= MIN_OVERLAP; k--) {
    const suffix = prev.slice(-k)
    const consistent =
      typed.length >= k ? typed.startsWith(suffix) : suffix.startsWith(typed)
    if (consistent) return k
  }
  return 0
}

/** The shallow grips shown as ghost seeds, with their base payouts. */
export function gripOptions(
  prev: string,
  max = 3,
): Array<{ letters: string; overlap: number; gold: number }> {
  const out: Array<{ letters: string; overlap: number; gold: number }> = []
  for (let k = MIN_OVERLAP; k <= prev.length && out.length < max; k++) {
    out.push({ letters: prev.slice(-k), overlap: k, gold: k * k })
  }
  return out
}

export function createMatch(
  p1Name: string,
  p2Name: string | null = null,
  opener: PlayerId = 'p1',
  chainLimit?: number,
): MatchState {
  return {
    // The opener plays and shares the invite before anyone joins, so a fresh
    // match starts in the opener's turn with the second seat empty.
    phase: turnPhaseOf(opener),
    players: {
      p1: { id: 'p1', name: p1Name, gold: 0, lives: STARTING_LIVES },
      p2: { id: 'p2', name: p2Name ?? '', gold: 0, lives: STARTING_LIVES },
    },
    chain: [],
    usedWords: [],
    challenger: null,
    winner: null,
    version: 0,
    ...(chainLimit !== undefined ? { chainLimit } : {}),
    ...(p2Name === null ? { awaitingOpponent: true } : {}),
  }
}

/** The chain length that closes this match. */
export function chainLimitOf(state: MatchState): number {
  return state.chainLimit ?? CHAIN_LIMIT
}

/**
 * The friend takes the empty seat. The phase is left as the opener already
 * set it — if they've opened, the joiner steps straight into their own turn;
 * if not, it's still the opener's move. Only the waiting flag clears.
 */
export function joinMatch(state: MatchState, p2Name: string): MatchState {
  const next = structuredClone(state)
  next.players.p2.name = p2Name
  delete next.awaitingOpponent
  next.version++
  return next
}

/**
 * Winner when the chain completes: highest gold, ties broken by remaining
 * lives, then by longest single word on the chain. Null on a full tie.
 */
export function decideVaultWinner(state: MatchState): PlayerId | null {
  const { p1, p2 } = state.players
  if (p1.gold !== p2.gold) return p1.gold > p2.gold ? 'p1' : 'p2'
  if (p1.lives !== p2.lives) return p1.lives > p2.lives ? 'p1' : 'p2'
  const longest = (id: PlayerId) =>
    Math.max(0, ...state.chain.filter((l) => l.owner === id).map((l) => l.word.length))
  const l1 = longest('p1')
  const l2 = longest('p2')
  if (l1 !== l2) return l1 > l2 ? 'p1' : 'p2'
  return null
}

/**
 * The single door into match state. Validates the actor and the move
 * against the current phase and returns a NEW state (the input is never
 * mutated) or a player-facing error message.
 */
export function applyMove(state: MatchState, actor: PlayerId, move: Move): MoveResult {
  if (state.phase === 'VAULT_CLOSED' || state.phase === 'GAME_OVER')
    return err('This match is over.')

  if (state.phase === 'CHALLENGE_PENDING') {
    const challenger = state.challenger
    if (!challenger) return err('Challenge state is corrupt.') // unreachable via applyMove
    const defender = opponentOf(challenger)
    const accused = state.chain[state.chain.length - 1]
    if (move.type !== 'fold' && move.type !== 'stand') {
      return actor === defender
        ? err(`${accused.word.toUpperCase()} is under challenge — fold or stand.`)
        : err(`Waiting for ${state.players[defender].name} to fold or stand.`)
    }
    if (actor !== defender)
      return err(`Only ${state.players[defender].name} can fold or stand.`)
    return move.type === 'fold' ? fold(state) : stand(state, move.wordIsReal)
  }

  // P1_TURN or P2_TURN
  if (move.type === 'fold' || move.type === 'stand')
    return err("There's no challenge to answer.")
  const active: PlayerId = state.phase === 'P1_TURN' ? 'p1' : 'p2'
  if (actor !== active) return err('Not your turn yet.')
  if (move.type === 'play') return play(state, actor, move.word)
  if (move.type === 'pass') return pass(state, actor)
  return challenge(state, actor)
}

function err(error: string): MoveResult {
  return { ok: false, error }
}

function play(state: MatchState, actor: PlayerId, rawWord: string): MoveResult {
  const word = rawWord.trim().toLowerCase()
  if (!WORD_RE.test(word))
    return err(`Words are ${MIN_WORD_LENGTH}–${MAX_WORD_LENGTH} letters, a–z only.`)
  if (state.usedWords.includes(word))
    return err(`${word.toUpperCase()} has already been played this match.`)

  const prev = state.chain[state.chain.length - 1]
  let overlap = 0
  if (prev) {
    overlap = overlapOf(prev.word, word)
    if (overlap === 0) {
      const s2 = prev.word.slice(-2).toUpperCase()
      const s3 = prev.word.slice(-3).toUpperCase()
      return err(`Your word needs to start with ${s2} or ${s3}.`)
    }
  }

  const next = structuredClone(state)
  const gold = prev ? goldFor(overlap, word.length) : 0
  next.chain.push({ word, owner: actor, overlap, gold })
  next.usedWords.push(word)
  next.players[actor].gold += gold
  next.version++
  if (next.chain.length >= chainLimitOf(next)) {
    next.phase = 'VAULT_CLOSED'
    next.winner = decideVaultWinner(next)
  } else {
    next.phase = turnPhaseOf(opponentOf(actor))
  }
  return { ok: true, state: next }
}

function pass(state: MatchState, actor: PlayerId): MoveResult {
  const next = structuredClone(state)
  next.players[actor].lives--
  next.version++
  if (next.players[actor].lives <= 0) {
    next.phase = 'GAME_OVER'
    next.winner = opponentOf(actor)
  } else {
    // Opponent continues from the same word; no gold moves.
    next.phase = turnPhaseOf(opponentOf(actor))
  }
  return { ok: true, state: next }
}

function challenge(state: MatchState, actor: PlayerId): MoveResult {
  const target = state.chain[state.chain.length - 1]
  if (!target) return err('Nothing to challenge yet.')
  if (target.owner === actor) return err("You can't challenge your own word.")
  if (target.challengeSurvived)
    return err(`${target.word.toUpperCase()} already survived a challenge.`)

  const next = structuredClone(state)
  next.phase = 'CHALLENGE_PENDING'
  next.challenger = actor
  next.version++
  return { ok: true, state: next }
}

/** Remove the accused word and give back the gold it stole. */
function rewindChain(state: MatchState): void {
  const removed = state.chain.pop()
  if (removed) state.players[removed.owner].gold -= removed.gold
  // The word stays in usedWords: busted fakes can't be replayed.
}

function fold(state: MatchState): MoveResult {
  const challenger = state.challenger as PlayerId
  const defender = opponentOf(challenger)
  const next = structuredClone(state)
  rewindChain(next)
  next.players[defender].lives--
  next.challenger = null
  next.version++
  if (next.players[defender].lives <= 0) {
    next.phase = 'GAME_OVER'
    next.winner = challenger
  } else {
    // Defender plays again from the previous word.
    next.phase = turnPhaseOf(defender)
  }
  return { ok: true, state: next }
}

function stand(state: MatchState, wordIsReal: boolean): MoveResult {
  const challenger = state.challenger as PlayerId
  const defender = opponentOf(challenger)
  const next = structuredClone(state)
  next.challenger = null
  next.version++
  if (wordIsReal) {
    next.chain[next.chain.length - 1].challengeSurvived = true
    next.players[challenger].lives--
    if (next.players[challenger].lives <= 0) {
      next.phase = 'GAME_OVER'
      next.winner = defender
    } else {
      // Challenger still has to make a move, now from the verified word.
      next.phase = turnPhaseOf(challenger)
    }
  } else {
    rewindChain(next)
    next.players[defender].lives--
    if (next.players[defender].lives <= 0) {
      next.phase = 'GAME_OVER'
      next.winner = challenger
    } else {
      // Challenger plays from the previous word.
      next.phase = turnPhaseOf(challenger)
    }
  }
  return { ok: true, state: next }
}
