import { describe, it, expect } from 'vitest'
import {
  applyMove,
  createMatch,
  decideChainWinner,
  pointsFor,
  joinMatch,
  gripOptions,
  nextKeyHints,
  overlapOf,
  provisionalGrip,
  validSuffixes,
  type MoveResult,
} from './engine'
import { CHAIN_LIMIT, type MatchState, type Move, type PlayerId } from './types'

const play = (word: string): Move => ({ type: 'play', word })
const pass: Move = { type: 'pass' }
// The referee's verdict is injected: true → STANDS, false → REJECTED.
const challenge = (wordIsReal: boolean): Move => ({ type: 'challenge', wordIsReal })

/** Apply a scripted move list, throwing on any rejection. */
function run(state: MatchState, steps: Array<[PlayerId, Move]>): MatchState {
  for (const [actor, move] of steps) {
    const r = applyMove(state, actor, move)
    if (!r.ok) throw new Error(`${actor} ${move.type}: ${r.error}`)
    state = r.state
  }
  return state
}

function expectError(r: MoveResult, message: string) {
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.error).toBe(message)
}

const fresh = () => createMatch('You', 'Dana')

describe('overlapOf', () => {
  it('finds the longest suffix-prefix overlap', () => {
    expect(overlapOf('vault', 'ultra')).toBe(3)
    expect(overlapOf('ultra', 'radish')).toBe(2)
    expect(overlapOf('onward', 'zebra')).toBe(0)
  })

  it('allows the full previous word only as a proper prefix', () => {
    expect(overlapOf('ultra', 'ultramarine')).toBe(5)
    expect(overlapOf('ram', 'rams')).toBe(3)
    expect(overlapOf('ultra', 'ultra')).toBe(0) // same word: not a proper prefix
  })

  it('allows the next word to be a suffix of the previous', () => {
    expect(overlapOf('planet', 'net')).toBe(3)
  })

  it('never returns an overlap below 2', () => {
    expect(overlapOf('cat', 'tap')).toBe(0)
  })
})

describe('pointsFor', () => {
  it('is overlap squared plus length bonus beyond 6', () => {
    expect(pointsFor(2, 4)).toBe(4)
    expect(pointsFor(3, 6)).toBe(9)
    expect(pointsFor(4, 7)).toBe(17)
    expect(pointsFor(5, 11)).toBe(30) // ultramarine
  })
})

describe('validSuffixes', () => {
  it('lists suffixes shortest first, up to the whole word', () => {
    expect(validSuffixes('onward')).toEqual(['rd', 'ard', 'ward', 'nward', 'onward'])
  })
})

describe('match setup', () => {
  it('opens in the opener\'s turn while awaiting a friend, and lets the opener play', () => {
    const state = createMatch('You')
    expect(state.phase).toBe('P1_TURN')
    expect(state.awaitingOpponent).toBe(true)
    // The opener can open a word before anyone joins; the waiting seat can't move.
    expectError(applyMove(state, 'p2', play('vault')), 'Not your turn yet.')
    const opened = applyMove(state, 'p1', play('vault'))
    expect(opened.ok).toBe(true)
    if (opened.ok) expect(opened.state.phase).toBe('P2_TURN')
  })

  it('joinMatch fills the seat and clears the waiting flag', () => {
    // Opener has already played, so the joiner steps into their own turn.
    const opened = run(createMatch('You'), [['p1', play('vault')]])
    const state = joinMatch(opened, 'Dana')
    expect(state.phase).toBe('P2_TURN')
    expect(state.awaitingOpponent).toBeUndefined()
    expect(state.players.p2.name).toBe('Dana')
  })

  it('starts immediately with both names (solo mode)', () => {
    expect(fresh().phase).toBe('P1_TURN')
  })
})

describe('playing a word', () => {
  it('accepts any well-formed opener with no points', () => {
    const state = run(fresh(), [['p1', play('vault')]])
    expect(state.chain).toEqual([{ word: 'vault', owner: 'p1', overlap: 0, points: 0 }])
    expect(state.players.p1.points).toBe(0)
    expect(state.phase).toBe('P2_TURN')
  })

  it('scores overlap² + length bonus and alternates turns', () => {
    const state = run(fresh(), [
      ['p1', play('vault')],
      ['p2', play('ultra')], // overlap ult → 9g
      ['p1', play('radish')], // overlap ra → 4g
    ])
    expect(state.players.p2.points).toBe(9)
    expect(state.players.p1.points).toBe(4)
    expect(state.phase).toBe('P2_TURN')
    expect(state.version).toBe(3)
  })

  it('handles ultra → ultramarine: overlap 5, points 30', () => {
    const state = run(fresh(), [
      ['p1', play('vault')],
      ['p2', play('ultra')],
      ['p1', play('ultramarine')],
    ])
    const link = state.chain[2]
    expect(link.overlap).toBe(5)
    expect(link.points).toBe(30)
    expect(state.players.p1.points).toBe(30)
  })

  it('normalizes case and whitespace', () => {
    const state = run(fresh(), [['p1', play('  VAULT ')]])
    expect(state.chain[0].word).toBe('vault')
  })

  it('rejects malformed words', () => {
    const msg = 'Words are 3–12 letters, a–z only.'
    expectError(applyMove(fresh(), 'p1', play('ab')), msg)
    expectError(applyMove(fresh(), 'p1', play('abcdefghijklm')), msg)
    expectError(applyMove(fresh(), 'p1', play("don't")), msg)
    expectError(applyMove(fresh(), 'p1', play('abc1')), msg)
  })

  it('rejects repeats, case-insensitively', () => {
    const state = run(fresh(), [
      ['p1', play('vault')],
      ['p2', play('ultra')],
    ])
    expectError(applyMove(state, 'p1', play('Ultra')), 'ULTRA has already been played this match.')
  })

  it('rejects words with no valid overlap, naming the required suffixes', () => {
    const state = run(fresh(), [
      ['p1', play('vault')],
      ['p2', play('ultra')],
      ['p1', play('ultramarine')],
      ['p2', play('neon')],
      ['p1', play('onward')],
    ])
    expectError(applyMove(state, 'p2', play('zebra')), 'Your word needs to start with RD or ARD.')
  })

  it('accepts a bluff — no dictionary check at play time', () => {
    const state = run(fresh(), [
      ['p1', play('vault')],
      ['p2', play('ltxq')], // pure nonsense, valid overlap "lt"
    ])
    expect(state.chain[1].word).toBe('ltxq')
    expect(state.players.p2.points).toBe(4)
  })

  it('does not mutate the input state', () => {
    const before = fresh()
    const r = applyMove(before, 'p1', play('vault'))
    expect(r.ok).toBe(true)
    expect(before.chain).toHaveLength(0)
    expect(before.version).toBe(0)
  })
})

describe('turn and actor guards', () => {
  it('rejects out-of-turn moves', () => {
    expectError(applyMove(fresh(), 'p2', play('vault')), 'Not your turn yet.')
    expectError(applyMove(fresh(), 'p2', pass), 'Not your turn yet.')
  })
})

describe('passing', () => {
  it('costs a life, earns nothing, and hands over the same word', () => {
    const state = run(fresh(), [
      ['p1', play('vault')],
      ['p2', pass],
    ])
    expect(state.players.p2.lives).toBe(2)
    expect(state.players.p2.points).toBe(0)
    expect(state.chain).toHaveLength(1)
    expect(state.phase).toBe('P1_TURN')
  })

  it('ends the game when the last life goes', () => {
    const state = run(fresh(), [
      ['p1', play('vault')],
      ['p2', pass],
      ['p1', pass],
      ['p2', pass],
      ['p1', pass],
      ['p2', pass], // p2's third pass
    ])
    expect(state.phase).toBe('GAME_OVER')
    expect(state.winner).toBe('p1')
  })
})

describe('challenges', () => {
  const midMatch = () =>
    run(fresh(), [
      ['p1', play('vault')],
      ['p2', play('ultra')],
    ])

  it('cannot target an empty chain', () => {
    expectError(applyMove(fresh(), 'p1', challenge(false)), 'Nothing to challenge yet.')
  })

  it('cannot target your own word (e.g. after the opponent passes)', () => {
    const state = run(fresh(), [
      ['p1', play('vault')],
      ['p2', pass],
    ])
    expectError(applyMove(state, 'p1', challenge(false)), "You can't challenge your own word.")
  })

  it('REJECTED (fake): word removed, points refunded, owner loses a life, challenger plays on', () => {
    const state = run(midMatch(), [['p1', challenge(false)]])
    expect(state.chain.map((l) => l.word)).toEqual(['vault'])
    expect(state.players.p2.points).toBe(0) // the 9g refunded
    expect(state.players.p2.lives).toBe(2)
    expect(state.phase).toBe('P1_TURN') // the challenger plays from the previous word

    // …and must play from VAULT, not from the removed ULTRA
    expectError(applyMove(state, 'p1', play('radish')), 'Your word needs to start with LT or ULT.')
    expect(applyMove(state, 'p1', play('ultimatum')).ok).toBe(true)
  })

  it('a removed word can never be replayed', () => {
    const state = run(midMatch(), [['p1', challenge(false)]])
    expectError(applyMove(state, 'p1', play('ultra')), 'ULTRA has already been played this match.')
  })

  it('rejecting the opener leaves an empty chain and a fresh opening move', () => {
    const state = run(fresh(), [
      ['p1', play('xqzzle')],
      ['p2', challenge(false)],
    ])
    expect(state.chain).toHaveLength(0)
    expect(state.phase).toBe('P2_TURN') // the challenger (p2) opens next
    const next = applyMove(state, 'p2', play('vault'))
    expect(next.ok).toBe(true)
    if (next.ok) expect(next.state.chain[0].points).toBe(0)
  })

  it('STANDS (real): challenger loses a life and plays on from the verified word', () => {
    const state = run(midMatch(), [['p1', challenge(true)]])
    expect(state.players.p1.lives).toBe(2)
    expect(state.players.p2.lives).toBe(3)
    expect(state.players.p2.points).toBe(9) // keeps the points
    expect(state.chain[1].challengeSurvived).toBe(true)
    expect(state.phase).toBe('P1_TURN')
  })

  it('a survived word cannot be challenged again', () => {
    const state = run(midMatch(), [['p1', challenge(true)]])
    expectError(applyMove(state, 'p1', challenge(true)), 'ULTRA already survived a challenge.')
  })

  it('a failed challenge (STANDS) on the last life ends the game for the challenger', () => {
    const worn = run(midMatch(), [
      ['p1', pass],
      ['p2', play('radish')],
      ['p1', pass],
      ['p2', play('shovel')],
    ])
    expect(worn.players.p1.lives).toBe(1)
    const state = run(worn, [['p1', challenge(true)]])
    expect(state.phase).toBe('GAME_OVER')
    expect(state.winner).toBe('p2')
  })

  it('a busted bluff (REJECTED) on the last life ends the game for the word owner', () => {
    const worn = run(fresh(), [
      ['p1', play('vault')],
      ['p2', pass],
      ['p1', play('ultra')],
      ['p2', pass],
      ['p1', play('radish')],
      ['p2', play('shqux')], // bluff on the last life
    ])
    expect(worn.players.p2.lives).toBe(1)
    const state = run(worn, [['p1', challenge(false)]])
    expect(state.phase).toBe('GAME_OVER')
    expect(state.winner).toBe('p1')
  })
})

describe('chain completion (CHAIN_COMPLETE)', () => {
  // aabb → bbcc → ccdd … each 4 letters, overlap 2, 4g apiece.
  const pair = (i: number) => String.fromCharCode(97 + i).repeat(2)
  const chainWords = Array.from({ length: CHAIN_LIMIT }, (_, i) => pair(i) + pair(i + 1))

  it('completes the chain at 20 words and the richer player wins', () => {
    const steps = chainWords.map(
      (w, i): [PlayerId, Move] => [i % 2 === 0 ? 'p1' : 'p2', play(w)],
    )
    const state = run(fresh(), steps)
    expect(state.phase).toBe('CHAIN_COMPLETE')
    // p1's opener earns nothing, so p2 leads 40g to 36g.
    expect(state.players.p1.points).toBe(36)
    expect(state.players.p2.points).toBe(40)
    expect(state.winner).toBe('p2')
    expectError(applyMove(state, 'p1', play('anything')), 'This match is over.')
  })

  it('breaks points ties by lives, then longest word, then null', () => {
    const base = fresh()
    const withStats = (
      overrides: Partial<Record<PlayerId, { points?: number; lives?: number }>>,
      chain: Array<{ word: string; owner: PlayerId }> = [],
    ): MatchState => {
      const s = structuredClone(base)
      for (const id of ['p1', 'p2'] as PlayerId[]) {
        s.players[id].points = overrides[id]?.points ?? 10
        s.players[id].lives = overrides[id]?.lives ?? 2
      }
      s.chain = chain.map((c) => ({ ...c, overlap: 2, points: 4 }))
      return s
    }

    expect(decideChainWinner(withStats({ p1: { points: 12 }, p2: { points: 9 } }))).toBe('p1')
    expect(decideChainWinner(withStats({ p1: { lives: 1 }, p2: { lives: 3 } }))).toBe('p2')
    expect(
      decideChainWinner(
        withStats({}, [
          { word: 'longests', owner: 'p1' },
          { word: 'short', owner: 'p2' },
        ]),
      ),
    ).toBe('p1')
    expect(
      decideChainWinner(
        withStats({}, [
          { word: 'equal', owner: 'p1' },
          { word: 'level', owner: 'p2' },
        ]),
      ),
    ).toBeNull()
  })
})

describe('scripted match replay', () => {
  it('replays a full dramatic match from a move list', () => {
    const script: Array<[PlayerId, Move]> = [
      ['p1', play('vault')],
      ['p2', play('ultra')], // +9g
      ['p1', play('ultramarine')], // +30g
      ['p2', play('nectar')], // +4g
      ['p1', challenge(true)], // accuses NECTAR — real, STANDS: p1 loses a life, plays on
      ['p1', play('arrow')], // +4g, from the verified word
      ['p2', play('owly')], // +4g — a bluff
      ['p1', challenge(false)], // OWLY fake, REJECTED: p2 loses a life, owly removed, 4g refunded
      ['p1', pass], // p1 lives 1
      ['p2', pass], // p2 lives 1
      ['p1', pass], // p1 lives 0 — game over
    ]
    const state = run(fresh(), script)
    expect(state.phase).toBe('GAME_OVER')
    expect(state.winner).toBe('p2')
    expect(state.players.p1).toMatchObject({ points: 34, lives: 0 })
    expect(state.players.p2).toMatchObject({ points: 13, lives: 1 })
    expect(state.chain.map((l) => l.word)).toEqual([
      'vault',
      'ultra',
      'ultramarine',
      'nectar',
      'arrow',
    ])
    expect(state.usedWords).toContain('owly')
    expect(state.version).toBe(11)
  })
})

describe('provisionalGrip (composer display)', () => {
  it('snaps a short prefix to the deepest matching grip', () => {
    expect(provisionalGrip('onward', 'a')).toBe(3) // heading for ARD
    expect(provisionalGrip('onward', 'w')).toBe(4) // heading for WARD
    expect(provisionalGrip('onward', 'r')).toBe(2) // heading for RD
    expect(provisionalGrip('onward', 'o')).toBe(6) // heading for the proper prefix
  })

  it('holds the grip once typing passes it', () => {
    expect(provisionalGrip('onward', 'ard')).toBe(3)
    expect(provisionalGrip('onward', 'ardent')).toBe(3)
    expect(provisionalGrip('onward', 'rdxx')).toBe(2)
  })

  it('returns 0 for empty or impossible starts', () => {
    expect(provisionalGrip('onward', '')).toBe(0)
    expect(provisionalGrip('onward', 'd')).toBe(0)
    expect(provisionalGrip('onward', 'zebra')).toBe(0)
  })
})

describe('gripOptions (the fan)', () => {
  it('lists the shallowest grips with base payouts', () => {
    expect(gripOptions('onward')).toEqual([
      { letters: 'rd', overlap: 2, points: 4 },
      { letters: 'ard', overlap: 3, points: 9 },
      { letters: 'ward', overlap: 4, points: 16 },
    ])
  })

  it('caps at the word itself for short words', () => {
    expect(gripOptions('ram')).toEqual([
      { letters: 'am', overlap: 2, points: 4 },
      { letters: 'ram', overlap: 3, points: 9 },
    ])
  })
})

describe('nextKeyHints (guided deck keys)', () => {
  it('has no restriction for the opener (no previous word)', () => {
    expect(nextKeyHints(null, '')).toBeNull()
  })

  it('lights the first letters of every valid suffix when nothing is typed', () => {
    // plant → suffixes nt, ant, lant, plant → first letters n, a, l, p
    const h = nextKeyHints('plant', '')
    expect(h).not.toBeNull()
    expect([...(h?.valid ?? '')].sort()).toEqual(['a', 'l', 'n', 'p'])
    expect(h?.forced).toBeNull()
  })

  it('narrows to a single forced letter mid-grip', () => {
    // otter, typed "te" → only "ter" is consistent, so r is forced
    const h = nextKeyHints('otter', 'te')
    expect(h?.valid).toBe('r')
    expect(h?.forced).toBe('r')
  })

  it('offers the branch letters while several suffixes remain reachable', () => {
    // otter, typed "t" → "ter" (needs e) and "tter" (needs t) both live
    const h = nextKeyHints('otter', 't')
    expect([...(h?.valid ?? '')].sort()).toEqual(['e', 't'])
    expect(h?.forced).toBeNull()
  })

  it('returns null once the grip is locked and the word is free-form', () => {
    // otter, typed "ter" → grip locked at 3, any next letter is legal
    expect(nextKeyHints('otter', 'ter')).toBeNull()
  })
})
