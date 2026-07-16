import { describe, expect, it } from 'vitest'
import type { MatchState } from '../game'
import type { MatchSummary } from '../lib/protocol'
import type { SoloSave } from '../solo/useSoloMatch'
import { duelBucket, needsYouCount, soloBucket, soloYourTurn } from './lobby'

function summary(over: Partial<MatchSummary>): MatchSummary {
  return {
    code: 'AB12',
    you: 'p1',
    yourName: 'You',
    opponentName: 'Dana',
    phase: 'P1_TURN',
    yourTurn: true,
    awaitingOpponent: false,
    yourScore: 0,
    opponentScore: 0,
    winner: null,
    lastMoveAt: null,
    opponentPresent: false,
    openingWord: null,
    ...over,
  }
}

function solo(phase: MatchState['phase']): SoloSave {
  return {
    state: { phase } as MatchState,
    difficulty: 'easy',
    opener: 'p1',
  }
}

describe('duelBucket', () => {
  it('routes an empty seat to pending regardless of turn', () => {
    expect(duelBucket(summary({ awaitingOpponent: true, yourTurn: true }))).toBe('pending')
    expect(duelBucket(summary({ awaitingOpponent: true, yourTurn: false }))).toBe('pending')
  })

  it('routes a decided game to finished', () => {
    expect(duelBucket(summary({ phase: 'GAME_OVER', winner: 'p1' }))).toBe('finished')
    expect(duelBucket(summary({ phase: 'CHAIN_COMPLETE', winner: 'p2' }))).toBe('finished')
  })

  it('splits an active game by whose turn it is', () => {
    expect(duelBucket(summary({ yourTurn: true }))).toBe('yourMove')
    expect(duelBucket(summary({ yourTurn: false }))).toBe('theirMove')
  })
})

describe('soloYourTurn / soloBucket', () => {
  it('is your turn on P1_TURN, not on the bot turn', () => {
    expect(soloYourTurn(solo('P1_TURN').state)).toBe(true)
    expect(soloYourTurn(solo('P2_TURN').state)).toBe(false)
  })

  it('buckets solo games', () => {
    expect(soloBucket(solo('P1_TURN'))).toBe('yourMove')
    expect(soloBucket(solo('P2_TURN'))).toBe('theirMove')
    expect(soloBucket(solo('GAME_OVER'))).toBe('finished')
  })
})

describe('needsYouCount', () => {
  it('counts your-turn duels, pending invites, and a your-turn solo', () => {
    const summaries = [
      summary({ code: 'AAAA', yourTurn: true }), // your move
      summary({ code: 'BBBB', yourTurn: false }), // their move
      summary({ code: 'CCCC', awaitingOpponent: true }), // pending → counts
      summary({ code: 'DDDD', phase: 'GAME_OVER', winner: 'p1' }), // finished
    ]
    expect(needsYouCount(summaries, null)).toBe(2)
    expect(needsYouCount(summaries, solo('P1_TURN'))).toBe(3)
    expect(needsYouCount(summaries, solo('P2_TURN'))).toBe(2)
  })

  it('is zero when nothing is waiting', () => {
    expect(needsYouCount([summary({ yourTurn: false })], solo('P2_TURN'))).toBe(0)
  })
})
