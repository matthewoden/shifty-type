// Pure lobby logic: which bucket a game belongs in, and how many games are
// waiting on the player right now. Shared by the Lobby screen and Home's
// badge (which reads the cached summaries), so it lives apart from React.

import { lastCallActorOf, type MatchState } from '../game'
import type { MatchSummary } from '../lib/protocol'
import type { SoloSave } from '../solo/useSoloMatch'

export type Bucket = 'yourMove' | 'theirMove' | 'pending' | 'finished'

function isTerminal(phase: MatchState['phase']): boolean {
  return phase === 'GAME_OVER' || phase === 'CHAIN_COMPLETE'
}

/** Which lobby section a duel belongs in. */
export function duelBucket(s: MatchSummary): Bucket {
  if (s.awaitingOpponent) return 'pending' // seat still empty — re-share the invite
  if (s.winner !== null || isTerminal(s.phase)) return 'finished'
  return s.yourTurn ? 'yourMove' : 'theirMove'
}

/** In solo the player is always p1; the bot is p2. */
export function soloYourTurn(state: MatchState): boolean {
  // Challenges resolve instantly, so the player only ever waits on P2_TURN —
  // or on the bot's last-call answer, after the player played the final word.
  if (state.phase === 'LAST_CALL') return lastCallActorOf(state) === 'p1'
  return state.phase === 'P1_TURN'
}

export function soloBucket(save: SoloSave): Bucket {
  if (isTerminal(save.state.phase)) return 'finished'
  return soloYourTurn(save.state) ? 'yourMove' : 'theirMove'
}

/**
 * How many games need the player to act: their turn in a duel, a defence to
 * make, a solo move — plus pending invites still waiting to be shared. Drives
 * Home's coral badge; computed from the cached summaries, so it's instant and
 * works offline (last-known, refreshed whenever the lobby fetches).
 */
export function needsYouCount(summaries: MatchSummary[], solo: SoloSave | null): number {
  let n = 0
  for (const s of summaries) {
    const b = duelBucket(s)
    if (b === 'yourMove' || b === 'pending') n++
  }
  if (solo && soloBucket(solo) === 'yourMove') n++
  return n
}
