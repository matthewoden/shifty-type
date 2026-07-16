import { describe, expect, it } from 'vitest'
import { WORD_LIST, applyMove, lastCallActorOf, pickPlayWord, type MatchState } from '../game'
import {
  GATED_BEATS,
  TUTORIAL_CHAIN_LIMIT,
  bubbleFor,
  makeTutorialFake,
  newTutorialState,
  scriptedLloydMove,
} from './tutorial'

const listSet = new Set<string>(WORD_LIST)

/** Drive one player move with the easy-bot picker (any legal word is fine). */
function playerPlays(state: MatchState): MatchState {
  const word = pickPlayWord(state, 'easy')
  expect(word).toBeTruthy()
  const r = applyMove(state, 'p1', { type: 'play', word: word as string })
  expect(r.ok).toBe(true)
  return (r as { ok: true; state: MatchState }).state
}

function lloydPlays(state: MatchState, cursor: number): MatchState {
  const move = scriptedLloydMove(state, cursor)
  expect(move).not.toBeNull()
  expect(move?.type).toBe('play')
  const r = applyMove(state, 'p2', move as { type: 'play'; word: string })
  expect(r.ok).toBe(true)
  return (r as { ok: true; state: MatchState }).state
}

describe('tutorial match setup', () => {
  it('Lloyd opens and the chain closes at 10 words', () => {
    let state = newTutorialState()
    expect(state.phase).toBe('P2_TURN')
    expect(state.chainLimit).toBe(TUTORIAL_CHAIN_LIMIT)

    state = lloydPlays(state, 0)
    expect(state.chain[0].word).toBe('plant')

    // Alternate to the limit. The list-fed simulation can dead-end on a rare
    // tail (a real player just types any word) — then the actor passes, as
    // the game rules say.
    let cursor = 1
    while (
      state.phase === 'P1_TURN' ||
      state.phase === 'P2_TURN' ||
      state.phase === 'LAST_CALL'
    ) {
      // The 10th word opens last call; the non-finisher shakes on it.
      if (state.phase === 'LAST_CALL') {
        const r = applyMove(state, lastCallActorOf(state), { type: 'accept' })
        expect(r.ok).toBe(true)
        state = (r as { ok: true; state: MatchState }).state
        continue
      }
      const actor = state.phase === 'P1_TURN' ? 'p1' : 'p2'
      let word: string | null
      if (actor === 'p2') {
        const move = scriptedLloydMove(state, cursor)
        cursor++
        word = move?.type === 'play' ? move.word : pickPlayWord(state, 'easy')
      } else {
        word = pickPlayWord(state, 'easy')
      }
      const r = applyMove(state, actor, word ? { type: 'play', word } : { type: 'pass' })
      expect(r.ok).toBe(true)
      state = (r as { ok: true; state: MatchState }).state
      expect(state.chain.length).toBeLessThanOrEqual(TUTORIAL_CHAIN_LIMIT)
    }
    // Either the chain completed at exactly 10 words, or passes drained a
    // player's lives first — both are legal ends of a 10-word match.
    if (state.phase === 'CHAIN_COMPLETE') {
      expect(state.chain.length).toBe(TUTORIAL_CHAIN_LIMIT)
    } else {
      expect(state.phase).toBe('GAME_OVER')
    }
  })
})

describe('the scripted beats', () => {
  it('plays the happy path: lazy reply, catchable fake, the ruling', () => {
    let state = newTutorialState()
    state = lloydPlays(state, 0) // PLANT
    state = playerPlays(state) // any legal word

    state = lloydPlays(state, 1) // the lazy reply
    const lazy = state.chain[state.chain.length - 1]
    expect(listSet.has(lazy.word)).toBe(true)

    state = playerPlays(state)

    state = lloydPlays(state, 2) // the fake
    const fake = state.chain[state.chain.length - 1]
    expect(listSet.has(fake.word)).toBe(false)
    expect(fake.overlap).toBeGreaterThanOrEqual(2)

    // The player calls it out — a fake resolves to REJECTED on the spot (the
    // hook rules against the embedded list; a fake isn't in it). The word is
    // struck, Lloyd loses a life, and the challenger is on move.
    const r = applyMove(state, 'p1', { type: 'challenge', wordIsReal: false })
    expect(r.ok).toBe(true)
    state = (r as { ok: true; state: MatchState }).state
    expect(state.chain.find((l) => l.word === fake.word)).toBeUndefined()
    expect(state.players.p2.lives).toBe(2)
    expect(state.phase).toBe('P1_TURN') // the challenger plays on

    state = playerPlays(state) // the bluff slot, from the rewound tail

    // Lloyd's remaining scripted moves are always plays, never challenges.
    expect(scriptedLloydMove(state, 3)?.type).toBe('play')
    expect(scriptedLloydMove(state, 4)?.type).toBe('play')
    // Script spent after five plays.
    expect(scriptedLloydMove(state, 5)).toBeNull()
  })
})

describe('the intro cards', () => {
  it('open the tutorial as gated beats with Lloyd-voice copy', () => {
    expect(GATED_BEATS.slice(0, 3)).toEqual(['intro1', 'intro2', 'opener'])
    expect(bubbleFor('intro1', {})[0].text).toContain('Shifty Type')
    expect(bubbleFor('intro2', {})[0].text).toContain('Two ways to win')
    // Lloyd claims his opener before the grip lesson starts.
    expect(bubbleFor('opener', {})[0].text).toContain('PLANT')
    // Lloyd's voice, not THE LESSON — and never the o-word.
    for (const beat of ['intro1', 'intro2', 'opener'] as const) {
      const [bubble] = bubbleFor(beat, {})
      expect(bubble.eyebrow).toBeUndefined()
      expect(bubble.text.toLowerCase()).not.toContain('opponent')
    }
  })
})

describe('makeTutorialFake', () => {
  it('produces OTTERLY from INGOT', () => {
    expect(makeTutorialFake('ingot', [])).toBe('otterly')
  })
  it('never returns a list word or a repeat', () => {
    for (const prev of ['plant', 'lemon', 'random', 'errand']) {
      const fake = makeTutorialFake(prev, [])
      expect(fake).toBeTruthy()
      expect(listSet.has(fake as string)).toBe(false)
      expect((fake as string).startsWith(prev.slice(-2))).toBe(true)
      const next = makeTutorialFake(prev, [fake as string])
      expect(next).not.toBe(fake)
    }
  })
})
