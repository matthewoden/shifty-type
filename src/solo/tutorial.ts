// Lloyd's tutorial: the scripted first match (mockups/tutorial-flow.html).
// Pure script logic — beat order, Lloyd's scripted moves, and his lines.
// The React side (useTutorial) owns timing, gating, and events.

import {
  MAX_WORD_LENGTH,
  WORD_LIST,
  createMatch,
  pickPlayWord,
  type MatchState,
  type Move,
} from '../game'

/** Tutorial matches are short: ~6 scripted words + 4 free ones. */
export const TUTORIAL_CHAIN_LIMIT = 10

export const TUTORIAL_DONE_KEY = 'wordchain.tutorial.v1'

export function isTutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_DONE_KEY) === '1'
  } catch {
    return false
  }
}

export function markTutorialDone(): void {
  try {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1')
  } catch {
    // storage unavailable — the card just stays
  }
}

/** Lloyd opens (p2), and the chain closes at 10 words. */
export function newTutorialState(): MatchState {
  return createMatch('You', 'Lloyd', 'p2', TUTORIAL_CHAIN_LIMIT)
}

/**
 * The lesson beats, in order. Gated beats stop the game for a tap; passive
 * beats keep a bubble up while the turn is live; 'smell' is its own thing —
 * only the challenge advances it.
 */
export type Beat =
  | 'intro1' // gated: what the game is (board still empty)
  | 'intro2' // gated: the two ways to win
  | 'boot' // Lloyd hasn't opened yet
  | 'opener' // gated: Lloyd claims PLANT before the rules start
  | 'grip' // gated: the rule + the fan
  | 'firstWord' // passive: guided ANTIC (ghost finish + glowing key)
  | 'wait1' // Lloyd's lazy reply is coming
  | 'points' // gated: the scoring rule
  | 'rep' // passive: second word, no hints
  | 'wait2' // Lloyd's fake is coming
  | 'smellIntro' // gated: Lloyd oversells the fake, in character
  | 'smell' // challenge-gated: tap the flagged word
  | 'bothWays' // gated: the ruling aftermath + the reverse risk
  | 'bluff' // passive: make one up
  | 'compliment' // gated: Lloyd reacts to the bluff
  | 'handover' // gated: Lloyd goes quiet after this
  | 'done' // live game to the end

export const GATED_BEATS: readonly Beat[] = [
  'intro1',
  'intro2',
  'opener',
  'grip',
  'points',
  'smellIntro',
  'bothWays',
  'compliment',
  'handover',
]

/** Beats where the player's turn is live (deck, fan, Play). */
export const PASSIVE_BEATS: readonly Beat[] = ['firstWord', 'rep', 'bluff', 'done']

/** The suggested first word — always valid because Lloyd always opens PLANT. */
export const SUGGESTED_WORD = 'antic'

const FAKE_ENDINGS = ['terly', 'ling', 'ory', 'ple', 'ery', 'ish'] as const

/**
 * A fake for Lloyd's bluff beat: the chain tip's 2-letter grip plus a
 * llama-flavored ending. On the happy path (…INGOT) this is OTTERLY.
 * Never a list word, never a repeat.
 */
export function makeTutorialFake(prevWord: string, usedWords: readonly string[]): string | null {
  const grip = prevWord.slice(-2)
  const used = new Set(usedWords)
  const listSet = new Set<string>(WORD_LIST)
  for (const ending of FAKE_ENDINGS) {
    const fake = grip + ending
    if (fake.length <= MAX_WORD_LENGTH && !listSet.has(fake) && !used.has(fake)) return fake
  }
  return null
}

/**
 * Lloyd's scripted move for his nth play (cursor counts his plays so far).
 * Null once the script is spent — the caller falls back to the real easy
 * bot. Lloyd never challenges while the script runs, and he'd rather play
 * a fake than pass: the player's words can leave tails no list word grips
 * (that's the game), and a pass mid-lesson strands the script.
 */
export function scriptedLloydMove(state: MatchState, cursor: number): Move | null {
  if (cursor === 0) return { type: 'play', word: 'plant' }
  if (cursor > 4) return null
  const tip = state.chain[state.chain.length - 1]
  const fake = tip ? makeTutorialFake(tip.word, state.usedWords) : null
  // Cursor 2 is the bluff the player gets to catch — fake first. Everywhere
  // else a real word leads: 1 = the deliberately lazy reply, 3–4 = real words
  // during the free play after the lesson (the player's own bluff stands
  // unchallenged — Lloyd never accuses).
  const real = pickPlayWord(state, cursor === 1 ? 'easy' : cursor === 4 ? 'easy' : 'hard')
  const word = cursor === 2 ? (fake ?? real) : (real ?? fake)
  return word ? { type: 'play', word } : { type: 'pass' }
}

export function isInWordList(word: string): boolean {
  return (WORD_LIST as readonly string[]).includes(word)
}

/** Lloyd's lines. Eyebrow 'lesson' renders as THE LESSON, else LLOYD.
 *  `**bold**` spans render emphasized. */
export interface BubbleCopy {
  eyebrow?: 'lloyd' | 'lesson'
  text: string
}

const NUMBER_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' }
function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

export function bubbleFor(
  beat: Beat,
  ctx: { lazyWord?: string; lazyOverlap?: number; lazyPoints?: number; fakeWord?: string; realWord?: string; needled?: boolean; toldYou?: boolean; bluffWord?: string; bluffWasReal?: boolean },
): BubbleCopy[] {
  switch (beat) {
    case 'intro1':
      return [
        {
          text: "Shifty Type is a game of trading words that overlap. Some of the words will be real. Some of them won't.",
        },
      ]
    case 'intro2':
      return [
        {
          text: 'Two ways to win: have the most points when the chain is complete, or run me out of lives. Those pips under your name? Guard them.',
        },
      ]
    case 'opener':
      return [
        {
          text: 'PLANT! My favorite opener. The first word of a match can be anything — every word after it has to connect.',
        },
      ]
    case 'grip':
      return [
        {
          text: "On your turn, you'll get to reply with a word of your own. But your word is restricted by mine.",
        },
        {
          text: 'Your word must start with at least the last two letters of my word. The more you overlap, the more points you get.',
        },
      ]
    case 'firstWord':
      return [
        {
          text: 'Try entering ANTIC for your turn. It overlaps ANT, three letters deep, for nine points. I lit up your next key.',
        },
      ]
    case 'points':
      return [
        {
          text: `I played ${(ctx.lazyWord ?? '').toUpperCase()}. It only overlapped ${numberWord(ctx.lazyOverlap ?? 2)} letters for ${ctx.lazyPoints ?? 4} points. When it comes to overlap, **go deep**.`,
        },
      ]
    case 'rep':
      return [{ text: 'Your go — no hints this time. Tap a starter to get going.' }]
    case 'smellIntro': {
      const word = (ctx.fakeWord ?? '').toUpperCase()
      const meaning =
        ctx.fakeWord === 'otterly'
          ? 'It means… like an otter. Very common word.'
          : "It means… don't worry about it, it's a very common word."
      return [{ text: `${word}. ${meaning}` }]
    }
    case 'smell':
      return [
        {
          eyebrow: 'lesson',
          text: ctx.needled
            ? 'Coward. Respectfully. Go on — tap the flagged word.'
            : 'Words only have to sound real — until someone asks for a ruling. Seems off? **Flag it.**',
        },
      ]
    case 'bothWays':
      // Only vouch for the replacement word when it actually is in the
      // list — a strange chain tail can force Lloyd back onto a fake.
      return [
        {
          text:
            ctx.realWord && isInWordList(ctx.realWord)
              ? `Fine, you got me. ${ctx.realWord.toUpperCase()} is real though. If you accuse a real word of being fake, you'll lose a life instead.`
              : "Fine, you got me. Careful though. If you accuse a real word of being fake, you'll lose a life instead.",
        },
      ]
    case 'bluff':
      return [
        {
          text: ctx.toldYou
            ? "Told you. Couldn't resist, huh? Your go — make one up this time."
            : "Your go. Make one up — anything that sounds real. I won't ask for a ruling.",
        },
      ]
    case 'compliment':
      return [
        {
          text: ctx.bluffWasReal
            ? 'A real one? In a bluffing lesson? Unsettling.'
            : `${(ctx.bluffWord ?? '').toUpperCase()}. Gorgeous. Definitely a word.`,
        },
      ]
    case 'handover':
      return [
        {
          text: "That's everything you need to know! Feel free to play the rest of this one out.",
        },
      ]
    default:
      return []
  }
}

export const WHISPER = 'Lloyd, whispering: do it. I deserve this.'
export const SENDOFF_WIN = 'You bluffed, you accused, you won. Go spring this on a friend.'
export const SENDOFF_LOSS = 'That got out of hand. Go spring this on a friend anyway.'
