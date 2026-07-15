// Orchestration for Lloyd's tutorial: a real match run by the real engine,
// with Lloyd's early moves scripted and the lesson beats gating the pace.
// Deliberately not persisted — the tutorial is two minutes; restarting is
// fine. Completion sets the Home-card flag.

import { useEffect, useRef, useState } from 'react'
import { applyMove, chooseBotMove, type MatchState, type Move, type PlayerId } from '../game'
import { lookupWord } from '../lib/referee'
import type { SoloEvent } from './useSoloMatch'
import {
  GATED_BEATS,
  PASSIVE_BEATS,
  bubbleFor,
  isInWordList,
  markTutorialDone,
  newTutorialState,
  scriptedLloydMove,
  type Beat,
} from './tutorial'

export function useTutorial() {
  const [state, setState] = useState<MatchState>(newTutorialState)
  const [beat, setBeat] = useState<Beat>('intro1')
  const [error, setError] = useState<string | null>(null)
  const [event, setEvent] = useState<SoloEvent | null>(null)
  const [botThinking, setBotThinking] = useState(false)
  const [resolving, setResolving] = useState(false)

  // Lloyd's play count — drives the script.
  const cursorRef = useRef(0)
  // Script context for Lloyd's lines.
  const [ctx, setCtx] = useState<{
    lazyWord?: string
    lazyOverlap?: number
    lazyGold?: number
    fakeWord?: string
    realWord?: string
    needled?: boolean
    toldYou?: boolean
    bluffWord?: string
    bluffWasReal?: boolean
  }>({})

  const terminal = state.phase === 'GAME_OVER' || state.phase === 'VAULT_CLOSED'
  const playerTurn = state.phase === 'P1_TURN'
  const gated = (GATED_BEATS as readonly string[]).includes(beat)
  const passive = (PASSIVE_BEATS as readonly string[]).includes(beat)
  const botTurn =
    state.phase === 'P2_TURN' ||
    (state.phase === 'CHALLENGE_PENDING' && state.challenger === 'p1')

  // Completing the tutorial (either ending) retires the Home card.
  useEffect(() => {
    if (terminal) markTutorialDone()
  }, [terminal])

  // Lloyd acts 1–2s after any state that leaves him the move — except his
  // opening, which lands the instant the intro cards are tapped away: a
  // dead board reads as a loading hang, not thinking. He also waits out
  // the intro cards and the compliment/handover bubbles: his first free
  // move is the signal that the lesson is really over.
  useEffect(() => {
    if (!botTurn) return
    if (
      state.phase === 'P2_TURN' &&
      (beat === 'intro1' || beat === 'intro2' || beat === 'compliment' || beat === 'handover')
    )
      return
    setBotThinking(true)
    const timer = setTimeout(() => {
      setBotThinking(false)

      if (state.phase === 'CHALLENGE_PENDING') {
        const accused = state.chain[state.chain.length - 1]
        // Scripted defense: fakes always fold (the planted one included —
        // a strange tail can force any scripted slot onto a fake), list
        // words always stand. After handover, the real bot judges the same.
        const move: Move =
          beat === 'done'
            ? chooseBotMove(state, 'p2', 'easy')
            : isInWordList(accused.word)
              ? { type: 'stand', wordIsReal: true }
              : { type: 'fold' }
        const r = applyMove(state, 'p2', move)
        if (!r.ok) return
        setState(r.state)
        if (move.type === 'fold') {
          setEvent({ kind: 'bot-folded', word: accused.word })
        } else if (move.type === 'stand') {
          setEvent({ kind: 'verdict', word: accused.word, real: true, defender: 'p2' })
          if (beat === 'bluff') setCtx((c) => ({ ...c, toldYou: true }))
        }
        return
      }

      // P2_TURN: scripted while the script lasts, the real easy bot after.
      const cursor = cursorRef.current
      const move = scriptedLloydMove(state, cursor) ?? chooseBotMove(state, 'p2', 'easy')
      const r = applyMove(state, 'p2', move)
      if (!r.ok) return
      setState(r.state)
      if (move.type === 'play') {
        cursorRef.current = cursor + 1
        const played = r.state.chain[r.state.chain.length - 1]
        if (cursor === 0) setBeat('opener')
        else if (cursor === 1) {
          setCtx((c) => ({
            ...c,
            lazyWord: played.word,
            lazyOverlap: played.overlap,
            lazyGold: played.gold,
          }))
          setBeat('points')
        } else if (cursor === 2) {
          setCtx((c) => ({ ...c, fakeWord: played.word }))
          setBeat('smellIntro')
        } else if (cursor === 3) {
          setCtx((c) => ({ ...c, realWord: played.word }))
          setBeat('bothWays')
        }
      } else if (beat !== 'done' && move.type === 'pass') {
        // The script could not find its word (vanishingly unlikely) — drop
        // the remaining lessons rather than strand the match.
        setBeat('done')
      }
    }, beat === 'boot' ? 0 : 1000 + Math.random() * 1000)
    return () => clearTimeout(timer)
  }, [state, beat, botTurn, ctx.fakeWord])

  function apply(actor: PlayerId, move: Move): boolean {
    const r = applyMove(state, actor, move)
    if (!r.ok) {
      setError(r.error)
      return false
    }
    setError(null)
    setState(r.state)
    return true
  }

  /** Tap-to-continue on a gated bubble. */
  function advance() {
    if (beat === 'intro1') setBeat('intro2')
    else if (beat === 'intro2') setBeat('boot')
    else if (beat === 'opener') setBeat('grip')
    else if (beat === 'grip') setBeat('firstWord')
    else if (beat === 'points') setBeat('rep')
    else if (beat === 'smellIntro') setBeat('smell')
    else if (beat === 'bothWays') setBeat('bluff')
    else if (beat === 'compliment') setBeat('handover')
    else if (beat === 'handover') setBeat('done')
  }

  function playWord(word: string): boolean {
    if (!apply('p1', { type: 'play', word })) return false
    if (beat === 'firstWord') setBeat('wait1')
    else if (beat === 'rep') setBeat('wait2')
    else if (beat === 'bluff') {
      setCtx((c) => ({ ...c, bluffWord: word, bluffWasReal: isInWordList(word) }))
      setBeat('compliment')
    }
    return true
  }

  function pass(): boolean {
    if (!apply('p1', { type: 'pass' })) return false
    if (beat === 'firstWord') setBeat('wait1')
    else if (beat === 'rep') setBeat('wait2')
    else if (beat === 'bluff') setBeat('handover')
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

  return {
    state,
    beat,
    bubbles: bubbleFor(beat, ctx),
    gated,
    passive,
    error,
    event,
    botThinking,
    resolving,
    terminal,
    playerTurn,
    advance,
    playWord,
    pass,
    challenge: () => apply('p1', { type: 'challenge' }),
    neverMind: () => setCtx((c) => ({ ...c, needled: true })),
    defend,
    coinFlip,
    clearEvent: () => setEvent(null),
  }
}
