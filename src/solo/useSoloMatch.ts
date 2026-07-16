// Solo match orchestration: the player is always p1 (blue), the bot p2.
// Owns the bot's thinking delay, challenge resolution, transient UI events,
// and localStorage persistence so a hospital session can stop and resume
// at any point — mid-challenge included.

import { useEffect, useState } from 'react'
import {
  applyMove,
  chooseBotMove,
  createMatch,
  type Difficulty,
  type MatchState,
  type Move,
  type PlayerId,
} from '../game'
import { lookupWord } from '../lib/referee'

/** Three llamas, three moods. */
export const LLAMAS: Record<Difficulty, string> = {
  easy: 'Lloyd',
  medium: 'Llois',
  hard: 'Llarry',
}
export const SOLO_SAVE_KEY = 'wordchain.solo.v1'

export interface SoloSave {
  state: MatchState
  difficulty: Difficulty
  opener: PlayerId
}

export type SoloEvent =
  | { kind: 'bot-passed' }
  /** A resolved challenge. `challenger` is whoever flagged (p1 = you, p2 = bot). */
  | { kind: 'verdict'; word: string; real: boolean; challenger: PlayerId }
  /** Your challenge couldn't reach the referee — flag it again in a moment. */
  | { kind: 'referee-error'; word: string }

export function newSoloSave(difficulty: Difficulty, opener: PlayerId = 'p1'): SoloSave {
  return { state: createMatch('You', LLAMAS[difficulty], opener), difficulty, opener }
}

export function loadSoloSave(): SoloSave | null {
  try {
    const raw = localStorage.getItem(SOLO_SAVE_KEY)
    if (!raw) return null
    const save = JSON.parse(raw) as SoloSave
    if (!save?.state?.phase || !save.state.players || !save.difficulty) return null
    return save
  } catch {
    return null
  }
}

export function useSoloMatch(initial: SoloSave) {
  const [save, setSave] = useState(initial)
  const { state, difficulty, opener } = save
  const [error, setError] = useState<string | null>(null)
  const [event, setEvent] = useState<SoloEvent | null>(null)
  const [botThinking, setBotThinking] = useState(false)

  const terminal = state.phase === 'GAME_OVER' || state.phase === 'CHAIN_COMPLETE'
  // Challenges resolve instantly, so the bot only ever acts on its own turn.
  const botTurn = state.phase === 'P2_TURN'

  // Persist after every change; a finished match clears the slot.
  useEffect(() => {
    if (terminal) localStorage.removeItem(SOLO_SAVE_KEY)
    else localStorage.setItem(SOLO_SAVE_KEY, JSON.stringify(save))
  }, [save, terminal])

  // The bot acts 1–2s after any state that leaves it the move.
  useEffect(() => {
    if (!botTurn) return
    setBotThinking(true)
    const timer = setTimeout(() => {
      setBotThinking(false)
      const move = chooseBotMove(state, 'p2', difficulty)
      // The word under a bot challenge is the player's newest — capture it
      // before applyMove, since a rejected word is popped off the chain.
      const accused = state.chain[state.chain.length - 1]
      const r = applyMove(state, 'p2', move)
      if (!r.ok) return // engine rejected a bot move: a bug, but never strand the UI
      setSave((s) => ({ ...s, state: r.state }))
      if (move.type === 'pass') setEvent({ kind: 'bot-passed' })
      else if (move.type === 'challenge')
        setEvent({ kind: 'verdict', word: accused.word, real: move.wordIsReal, challenger: 'p2' })
    }, 1000 + Math.random() * 1000)
    return () => clearTimeout(timer)
  }, [state, difficulty, botTurn])

  // The transient banners (bot passed, referee unreachable) clear themselves.
  useEffect(() => {
    if (event?.kind !== 'bot-passed' && event?.kind !== 'referee-error') return
    const timer = setTimeout(() => setEvent(null), 3500)
    return () => clearTimeout(timer)
  }, [event])

  function apply(actor: PlayerId, move: Move): boolean {
    const r = applyMove(state, actor, move)
    if (!r.ok) {
      setError(r.error)
      return false
    }
    setError(null)
    setSave((s) => ({ ...s, state: r.state }))
    return true
  }

  // The player flags the bot's newest word. The referee rules on the spot —
  // embedded list first (offline-safe), then the dictionary API. If the API
  // can't be reached for an out-of-list word, nothing changes and the player
  // can flag it again once they're back online.
  async function challengeBot() {
    const word = state.chain[state.chain.length - 1]?.word
    if (!word) return
    const verdict = await lookupWord(word)
    if (verdict === 'unknown') {
      setEvent({ kind: 'referee-error', word })
      return
    }
    const real = verdict === 'real'
    if (apply('p1', { type: 'challenge', wordIsReal: real }))
      setEvent({ kind: 'verdict', word, real, challenger: 'p1' })
  }

  function rematch() {
    const nextOpener: PlayerId = opener === 'p1' ? 'p2' : 'p1'
    setSave(newSoloSave(difficulty, nextOpener))
    setEvent(null)
    setError(null)
  }

  return {
    state,
    difficulty,
    opener,
    error,
    event,
    botThinking,
    terminal,
    playWord: (word: string) => apply('p1', { type: 'play', word }),
    pass: () => apply('p1', { type: 'pass' }),
    challengeBot,
    clearEvent: () => setEvent(null),
    clearError: () => setError(null),
    rematch,
  }
}
