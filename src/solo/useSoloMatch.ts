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
  | { kind: 'bot-folded'; word: string }
  | { kind: 'bot-passed' }
  | { kind: 'verdict'; word: string; real: boolean; defender: PlayerId; coinFlip?: boolean }
  | { kind: 'referee-offline'; word: string }

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
  const [resolving, setResolving] = useState(false)

  const terminal = state.phase === 'GAME_OVER' || state.phase === 'VAULT_CLOSED'
  const botTurn =
    state.phase === 'P2_TURN' ||
    (state.phase === 'CHALLENGE_PENDING' && state.challenger === 'p1')

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
      const r = applyMove(state, 'p2', move)
      if (!r.ok) return // engine rejected a bot move: a bug, but never strand the UI
      setSave((s) => ({ ...s, state: r.state }))
      const accused = state.chain[state.chain.length - 1]
      if (move.type === 'fold') setEvent({ kind: 'bot-folded', word: accused.word })
      else if (move.type === 'pass') setEvent({ kind: 'bot-passed' })
      else if (move.type === 'stand')
        setEvent({ kind: 'verdict', word: accused.word, real: true, defender: 'p2' })
    }, 1000 + Math.random() * 1000)
    return () => clearTimeout(timer)
  }, [state, difficulty, botTurn])

  // The "Rook passes" banner clears itself.
  useEffect(() => {
    if (event?.kind !== 'bot-passed') return
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

  async function defend(choice: 'fold' | 'stand') {
    if (choice === 'fold') {
      apply('p1', { type: 'fold' })
      return
    }
    const word = state.chain[state.chain.length - 1].word
    setResolving(true)
    const verdict = await lookupWord(word)
    setResolving(false)
    if (verdict === 'unknown') {
      setEvent({ kind: 'referee-offline', word })
      return
    }
    const real = verdict === 'real'
    if (apply('p1', { type: 'stand', wordIsReal: real }))
      setEvent({ kind: 'verdict', word, real, defender: 'p1' })
  }

  function coinFlip() {
    const word = state.chain[state.chain.length - 1].word
    const real = Math.random() < 0.5
    if (apply('p1', { type: 'stand', wordIsReal: real }))
      setEvent({ kind: 'verdict', word, real, defender: 'p1', coinFlip: true })
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
    resolving,
    terminal,
    playWord: (word: string) => apply('p1', { type: 'play', word }),
    pass: () => apply('p1', { type: 'pass' }),
    challengeBot: () => apply('p1', { type: 'challenge' }),
    defend,
    coinFlip,
    clearEvent: () => setEvent(null),
    clearError: () => setError(null),
    rematch,
  }
}
