// Draft-word state for inline play. The word under composition lives here;
// the grip, points quote, and validity are derived live. Purely input UI —
// submission is judged by the engine's applyMove as ever.

import { useEffect, useState } from 'react'
import {
  pointsFor,
  MAX_WORD_LENGTH,
  MIN_OVERLAP,
  MIN_WORD_LENGTH,
  nextKeyHints,
  provisionalGrip,
  type KeyHints,
} from '../game'

export interface Composer {
  typed: string
  /** Provisional grip on the previous word (0 = opener or no valid start). */
  grip: number
  /** Live take if played right now. */
  points: number
  canPlay: boolean
  /** Which deck keys to light for the next press; null = unrestricted. */
  keyHints: KeyHints | null
  key: (letter: string) => void
  backspace: () => void
  seed: (letters: string) => void
  clear: () => void
}

export function useComposer(prevWord: string | null, active: boolean): Composer {
  const [typed, setTyped] = useState('')

  // A new chain tip or a turn change always resets the draft.
  useEffect(() => {
    setTyped('')
  }, [prevWord, active])

  const grip = prevWord && typed ? provisionalGrip(prevWord, typed) : 0
  const points = prevWord ? pointsFor(grip, typed.length) : 0
  const canPlay = active && typed.length >= MIN_WORD_LENGTH
  // Only guide while it's actually the player's turn; otherwise the deck is
  // inert anyway and hints would be noise.
  const keyHints = active ? nextKeyHints(prevWord, typed) : null

  return {
    typed,
    grip,
    points,
    canPlay,
    keyHints,
    key: (letter) => {
      if (!active) return
      setTyped((t) => {
        if (t.length >= MAX_WORD_LENGTH) return t
        const next = t + letter.toLowerCase()
        // Dead keys are inert: no legal word can start off-grip, so letters
        // that would zero the grip never land — the fan stays the only hint.
        if (prevWord && provisionalGrip(prevWord, next) < MIN_OVERLAP) return t
        return next
      })
    },
    backspace: () => setTyped((t) => t.slice(0, -1)),
    seed: (letters) => {
      if (active) setTyped(letters.toLowerCase())
    },
    clear: () => setTyped(''),
  }
}
