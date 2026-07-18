// The solo-mode bot ("Casing the Joint"). Pure decision logic — the 1–2s
// thinking delay and any UI staging live in the caller. Randomness and the
// vocabulary are injectable for tests.

import { gripTargetOf, isChainBroken, overlapOf } from './engine'
import { WORD_LIST } from './wordlist'
import type { MatchState, Move, PlayerId } from './types'

/**
 * Lloyd keeps his words on screen: never longer than fits the board without
 * the caret-follow camera kicking in (12 tiles + the flag at 375px). Players
 * may go to MAX_WORD_LENGTH (40) — the monster plays are theirs to make.
 * The full list, long words included, still powers his challenge knowledge.
 */
export const BOT_MAX_WORD_LENGTH = 12

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface BotOptions {
  rng?: () => number
  wordList?: readonly string[]
}

/** Chance of challenging a player word that is NOT in the embedded list. */
const CHALLENGE_PROBABILITY: Record<Difficulty, number> = {
  easy: 0.15,
  medium: 0.4,
  hard: 0.75,
}

/** On hard, chance of bluffing instead of passing when stuck. */
const BLUFF_PROBABILITY = 0.1

/** Plausible fake-word endings, per GAME_DESIGN.md §Solo. */
const BLUFF_ENDINGS = ['ry', 'ish'] as const

/**
 * Does the bot want to flag the player's newest word? Words in the bot's own
 * list are never challenged; anything else is suspect with difficulty-scaled
 * probability. This is only the decision to flag — the caller asks the real
 * referee for the verdict (embedded list, then dictionary API), exactly like
 * a player's flag, so the bot loses a life when it flags a real word it
 * simply doesn't know.
 */
export function wantsChallenge(
  state: MatchState,
  botId: PlayerId,
  difficulty: Difficulty,
  options: BotOptions = {},
): boolean {
  const rng = options.rng ?? Math.random
  const list = options.wordList ?? WORD_LIST
  const last = state.chain[state.chain.length - 1]
  return (
    !!last &&
    // A snapped chain settles everything behind the break — never flag it.
    !isChainBroken(state) &&
    last.owner !== botId &&
    !last.challengeSurvived &&
    !list.includes(last.word) &&
    rng() < CHALLENGE_PROBABILITY[difficulty]
  )
}

/**
 * The bot's turn when it isn't challenging: play a word, bluff, or pass.
 * Challenge decisions live in wantsChallenge — the verdict needs the async
 * referee, so it can't resolve inside a pure move choice.
 */
export function chooseBotMove(
  state: MatchState,
  difficulty: Difficulty,
  options: BotOptions = {},
): Move {
  const rng = options.rng ?? Math.random
  const list = options.wordList ?? WORD_LIST
  const last = gripTargetOf(state)

  const word = pickPlayWord(state, difficulty, options)
  if (word) return { type: 'play', word }

  // Stuck. Hard bluffs 10% of the time; everyone else pays the life.
  if (last && difficulty === 'hard' && rng() < BLUFF_PROBABILITY) {
    const bluff = makeBluff(last.word, list, new Set(state.usedWords))
    if (bluff) return { type: 'play', word: bluff }
  }
  return { type: 'pass' }
}

/**
 * Just the word choice, no challenge/pass judgement — the tutorial script
 * uses this to make Lloyd play (never challenge) with a chosen greed level.
 * Null when no unused list word grips the chain tip.
 */
export function pickPlayWord(
  state: MatchState,
  difficulty: Difficulty,
  options: BotOptions = {},
): string | null {
  const rng = options.rng ?? Math.random
  const list = options.wordList ?? WORD_LIST
  // Null when the board is open — the match's opener, or a fresh chain
  // after a snap — so the bot picks freely, exactly like a human opener.
  const last = gripTargetOf(state)
  const used = new Set(state.usedWords)
  const candidates = list
    .map((word) => ({ word, overlap: last ? overlapOf(last.word, word) : 0 }))
    .filter(
      (c) =>
        c.word.length <= BOT_MAX_WORD_LENGTH &&
        !used.has(c.word) &&
        (!last || c.overlap >= 2),
    )
  if (candidates.length === 0) return null
  return pickByGreed(candidates, difficulty, rng, !last)
}

function pickByGreed(
  candidates: Array<{ word: string; overlap: number }>,
  difficulty: Difficulty,
  rng: () => number,
  isOpener: boolean,
): string {
  if (isOpener) {
    // No overlap to be greedy about: easy grabs the commonest word, hard the
    // longest, medium something random.
    if (difficulty === 'easy') return candidates[0].word
    if (difficulty === 'medium') return candidates[Math.floor(rng() * candidates.length)].word
    return [...candidates].sort((a, b) => b.word.length - a.word.length)[0].word
  }
  if (difficulty === 'easy') {
    // First valid 2-overlap word (list is in frequency order); if only
    // riskier overlaps exist, take the smallest.
    const timid = candidates.find((c) => c.overlap === 2)
    if (timid) return timid.word
    return [...candidates].sort((a, b) => a.overlap - b.overlap)[0].word
  }
  if (difficulty === 'medium') {
    return candidates[Math.floor(rng() * candidates.length)].word
  }
  // Hard: maximize overlap², prefer long words.
  return [...candidates].sort(
    (a, b) => b.overlap - a.overlap || b.word.length - a.word.length,
  )[0].word
}

/**
 * A plausible fake: a list word that grips the current word, plus a common
 * ending ("lemon" → "lemonry"). Only reachable when every such list word is
 * already used, so the base word reads familiar but the result is new.
 */
function makeBluff(
  currentWord: string,
  list: readonly string[],
  used: Set<string>,
): string | null {
  for (let k = Math.min(currentWord.length, BOT_MAX_WORD_LENGTH - 2); k >= 2; k--) {
    const suffix = currentWord.slice(-k)
    for (const word of list) {
      if (!word.startsWith(suffix)) continue
      for (const ending of BLUFF_ENDINGS) {
        const fake = word + ending
        if (fake.length <= BOT_MAX_WORD_LENGTH && !used.has(fake)) return fake
      }
    }
  }
  return null
}
