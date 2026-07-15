import { describe, it, expect } from 'vitest'
import { chooseBotMove } from './bot'
import { applyMove, createMatch } from './engine'
import { WORD_SET } from './wordlist'
import type { MatchState, PlayerId } from './types'

// Player is p1, bot is p2 throughout, matching solo mode.
const BOT: PlayerId = 'p2'

/** A match where the given words are already on the chain, bot to move. */
function chainOf(...words: string[]): MatchState {
  let state = createMatch('You', 'Rook')
  let actor: PlayerId = 'p1'
  for (const word of words) {
    const r = applyMove(state, actor, { type: 'play', word })
    if (!r.ok) throw new Error(r.error)
    state = r.state
    actor = actor === 'p1' ? 'p2' : 'p1'
  }
  return state
}

const never = () => 0.99
const always = () => 0.0

describe('bot word choice', () => {
  const list = ['ethos', 'nettle', 'netting', 'only'] as const

  it('easy takes the first valid 2-overlap word in list order', () => {
    const move = chooseBotMove(chainOf('planet'), BOT, 'easy', {
      rng: never,
      wordList: [...list],
    })
    expect(move).toEqual({ type: 'play', word: 'ethos' })
  })

  it('hard maximizes overlap and prefers long words', () => {
    const move = chooseBotMove(chainOf('planet'), BOT, 'hard', {
      rng: never,
      wordList: [...list],
    })
    expect(move).toEqual({ type: 'play', word: 'netting' }) // overlap 3, longest
  })

  it('medium picks a random valid word', () => {
    const move = chooseBotMove(chainOf('planet'), BOT, 'medium', {
      rng: () => 0.5,
      wordList: [...list],
    })
    expect(move.type).toBe('play')
    if (move.type === 'play') expect(['ethos', 'nettle', 'netting']).toContain(move.word)
  })

  it('never repeats a used word', () => {
    // netting/nettle/ethos all playable but burned; only 'only' has no grip.
    const state = chainOf('planet')
    state.usedWords.push('netting', 'nettle', 'ethos')
    const move = chooseBotMove(state, BOT, 'easy', { rng: never, wordList: [...list] })
    expect(move).toEqual({ type: 'pass' })
  })

  it('plays only real list words on the default vocabulary', () => {
    const move = chooseBotMove(chainOf('vault'), BOT, 'hard', { rng: never })
    expect(move.type).toBe('play')
    if (move.type === 'play') expect(WORD_SET.has(move.word)).toBe(true)
  })

  it('opens from the list when it goes first', () => {
    const state = createMatch('You', 'Rook', 'p2')
    const move = chooseBotMove(state, BOT, 'easy', { rng: never, wordList: [...list] })
    expect(move).toEqual({ type: 'play', word: 'ethos' })
  })
})

describe('bot challenges', () => {
  it('challenges a non-list player word when the dice say so', () => {
    // 'netqx' opened by p1 is not in the default list → suspect
    expect(chooseBotMove(chainOf('netqx'), BOT, 'easy', { rng: () => 0.1 })).toEqual({
      type: 'challenge',
    })
    expect(chooseBotMove(chainOf('netqx'), BOT, 'easy', { rng: () => 0.2 })).not.toEqual({
      type: 'challenge',
    })
    expect(chooseBotMove(chainOf('netqx'), BOT, 'medium', { rng: () => 0.39 })).toEqual({
      type: 'challenge',
    })
    expect(chooseBotMove(chainOf('netqx'), BOT, 'hard', { rng: () => 0.74 })).toEqual({
      type: 'challenge',
    })
  })

  it('never challenges a word from the embedded list', () => {
    // 'water' is in the default list ('planet' isn't — it just misses the
    // top-2,000 frequency cut).
    const move = chooseBotMove(chainOf('water'), BOT, 'hard', { rng: always })
    expect(move.type).not.toBe('challenge')
  })

  it('never challenges a word that already survived a challenge', () => {
    const state = chainOf('netqx')
    state.chain[0].challengeSurvived = true
    const move = chooseBotMove(state, BOT, 'hard', { rng: always })
    expect(move.type).not.toBe('challenge')
  })

  it('never challenges its own word', () => {
    // p1 opener, p2 (bot) word, p1 passes → bot to move, last word is its own
    let state = chainOf('planet', 'netqx') // netqx played by the BOT here
    const r = applyMove(state, 'p1', { type: 'pass' })
    if (!r.ok) throw new Error(r.error)
    state = r.state
    const move = chooseBotMove(state, BOT, 'hard', { rng: always })
    expect(move.type).not.toBe('challenge')
  })
})

describe('bot defending', () => {
  function challenged(botWord: string): MatchState {
    let state = chainOf('planet', botWord)
    const r = applyMove(state, 'p1', { type: 'challenge' })
    if (!r.ok) throw new Error(r.error)
    return r.state
  }

  it('stands on a real word, verdict included', () => {
    const move = chooseBotMove(challenged('nettle'), BOT, 'easy', {
      wordList: ['nettle'],
    })
    expect(move).toEqual({ type: 'stand', wordIsReal: true })
  })

  it('folds when caught bluffing', () => {
    const move = chooseBotMove(challenged('netqx'), BOT, 'hard', {
      wordList: ['nettle'],
    })
    expect(move).toEqual({ type: 'fold' })
  })
})

describe('bot when stuck', () => {
  const stuckState = () => {
    // 'lemon' grips on/mon/emon/lemon; the only list word that fits is
    // 'lemon' itself, which is used — so the bot is stuck.
    return chainOf('lemon')
  }
  const tinyList = ['lemon', 'zebra']

  it('easy and medium pass', () => {
    expect(chooseBotMove(stuckState(), BOT, 'easy', { rng: always, wordList: tinyList })).toEqual(
      { type: 'pass' },
    )
    expect(
      chooseBotMove(stuckState(), BOT, 'medium', { rng: always, wordList: tinyList }),
    ).toEqual({ type: 'pass' })
  })

  it('hard bluffs 10% of the time: list word + common ending', () => {
    const move = chooseBotMove(stuckState(), BOT, 'hard', {
      rng: () => 0.05,
      wordList: tinyList,
    })
    expect(move).toEqual({ type: 'play', word: 'lemonry' })
    // …and the engine accepts the fake
    const r = applyMove(stuckState(), BOT, move)
    expect(r.ok).toBe(true)
  })

  it('hard passes the other 90%', () => {
    const move = chooseBotMove(stuckState(), BOT, 'hard', {
      rng: () => 0.5,
      wordList: tinyList,
    })
    expect(move).toEqual({ type: 'pass' })
  })

  it('passes rather than bluffing something unplayable', () => {
    // No list word grips 'lemon' at all → no plausible bluff base exists.
    // (Word marked survived so the bot doesn't challenge it instead.)
    const state = stuckState()
    state.chain[0].challengeSurvived = true
    const move = chooseBotMove(state, BOT, 'hard', {
      rng: () => 0.05,
      wordList: ['zebra'],
    })
    expect(move).toEqual({ type: 'pass' })
  })
})
