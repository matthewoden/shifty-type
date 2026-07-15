// Full-screen match moments shared by solo and multiplayer: the dramatic
// challenge beats, REAL/FAKE/FOLDED stamps, and the game-over panel with
// its gold count-up.

import { useEffect, useRef, useState } from 'react'
import { opponentOf, type MatchState, type PlayerId } from '../game'
import { playerTextClass, sideOf, tileClass, type Side } from './tiles'
import { WordTiles } from './WordTiles'
import { CoinIcon, FlagIcon } from './icons'

export function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-board/95 flex flex-col items-center justify-center gap-5 p-8 text-center z-10">
      {children}
    </div>
  )
}

export function BigWord({ word, side }: { word: string; side: Side }) {
  return (
    <div className="flex gap-[3px] flex-wrap justify-center">
      {word.split('').map((ch, i) => (
        <span key={i} className={tileClass(side, false)}>
          {ch}
        </span>
      ))}
    </div>
  )
}

export function VerdictStamp({
  stamp,
  good,
  copy,
  onDismiss,
}: {
  stamp: 'REAL' | 'FAKE' | 'FOLDED'
  /** Good news for the viewer → blue stamp; bad news → red. */
  good: boolean
  copy: string
  onDismiss: () => void
}) {
  return (
    <Overlay>
      <div
        className={`font-extrabold text-5xl tracking-widest border-4 rounded-xl px-6 py-2 -rotate-6 stamp-in ${
          good ? 'text-p1-lip border-p1-lip' : 'text-p2-lip border-p2-lip'
        }`}
      >
        {stamp}
      </div>
      <p className="text-ink font-bold max-w-xs">{copy}</p>
      <button
        onClick={onDismiss}
        className="h-13 px-8 rounded-2xl font-extrabold bg-ink-strong text-white shadow-[0_4px_0_#262E38] active:translate-y-0.5"
      >
        Continue
      </button>
    </Overlay>
  )
}

export function ConfirmChallengeSheet({
  whisper,
  onConfirm,
  onCancel,
}: {
  /** Tutorial-only: one italic line under the buttons. */
  whisper?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-ink-strong/40 flex items-end z-10" onClick={onCancel}>
      <div
        className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1rem))] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-bold text-ink text-[15px]">
          Challenge this word? Incorrect answers lose a life.
        </p>
        <button
          onClick={onConfirm}
          className="h-13 rounded-2xl font-extrabold bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5 flex items-center justify-center gap-2"
        >
          <FlagIcon className="w-5 h-5 text-white" /> Not a word!
        </button>
        <button onClick={onCancel} className="h-11 rounded-xl font-extrabold text-dim">
          Never mind
        </button>
        {whisper && (
          <p className="text-center text-[11.5px] font-bold italic text-dim -mt-1">{whisper}</p>
        )}
      </div>
    </div>
  )
}

export function CoinFlipPrompt({ onFlip }: { onFlip: () => void }) {
  return (
    <>
      <p className="text-ink font-bold">Referee offline — you two get to flip for it.</p>
      <button
        onClick={onFlip}
        className="h-13 px-6 rounded-2xl font-extrabold bg-ink-strong text-white shadow-[0_4px_0_#262E38] active:translate-y-0.5 flex items-center justify-center gap-2"
      >
        <CoinIcon className="w-5 h-5" /> Flip for it
      </button>
    </>
  )
}

/** The poker moment: your word is accused — fold or stand. */
export function DefendInterstitial({
  word,
  oppName,
  resolving,
  offline,
  onStand,
  onFold,
  onCoinFlip,
}: {
  word: string
  oppName: string
  resolving: boolean
  offline: boolean
  onStand: () => void
  onFold: () => void
  onCoinFlip: () => void
}) {
  return (
    <Overlay>
      <p className="text-dim font-bold text-sm uppercase tracking-widest">{oppName} challenges!</p>
      <BigWord word={word} side="you" />
      <p className="text-ink-strong font-extrabold text-xl">…is that even a word?</p>
      {resolving ? (
        <p className="text-ink font-bold animate-pulse motion-reduce:animate-none">
          Getting a ruling…
        </p>
      ) : offline ? (
        <CoinFlipPrompt onFlip={onCoinFlip} />
      ) : (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={onStand}
            className="h-13 rounded-2xl font-extrabold bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] active:translate-y-0.5"
          >
            Stand — it's real
          </button>
          <button
            onClick={onFold}
            className="h-13 rounded-2xl font-extrabold bg-white text-p2-lip shadow-[0_4px_0_#E2DDD3] active:translate-y-0.5"
          >
            Fold — take it back (−1 life)
          </button>
        </div>
      )}
    </Overlay>
  )
}

/** You've accused; the defender (or the coin) decides. */
export function AccusePending({
  word,
  waitingCopy,
  offline,
  onCoinFlip,
}: {
  word: string
  waitingCopy: string
  offline: boolean
  onCoinFlip: () => void
}) {
  return (
    <Overlay>
      <p className="text-dim font-bold text-sm uppercase tracking-widest">You accuse</p>
      <BigWord word={word} side="them" />
      {offline ? (
        <CoinFlipPrompt onFlip={onCoinFlip} />
      ) : (
        <p className="text-ink font-bold animate-pulse motion-reduce:animate-none">{waitingCopy}</p>
      )}
    </Overlay>
  )
}

/** Counts 0 → target once on mount; jumps straight there under reduced motion. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0)
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) {
      setValue(target)
      return
    }
    const start = performance.now()
    const duration = 900
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setValue(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return value
}

function GoldBar({
  name,
  gold,
  maxGold,
  side,
}: {
  name: string
  gold: number
  maxGold: number
  side: Side
}) {
  const shown = useCountUp(gold)
  const pct = maxGold > 0 ? Math.max(8, (gold / maxGold) * 100) : 8
  const fill =
    side === 'you'
      ? 'bg-p1 shadow-[0_3px_0_var(--color-p1-lip)]'
      : 'bg-p2 shadow-[0_3px_0_var(--color-p2-lip)]'
  return (
    <div className="w-full">
      <div className="flex justify-between font-extrabold text-[13px]">
        <span className={playerTextClass(side)}>{name}</span>
        <span className="text-ink-strong">{shown} pts</span>
      </div>
      <div className="h-4 bg-board-lo rounded-full mt-1 overflow-hidden">
        <div
          className={`h-full rounded-full ${fill} motion-safe:transition-[width] motion-safe:duration-1000 gold-bar`}
          style={{ ['--gold-w' as string]: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function GameOverPanel({
  state,
  you,
  rematchLabel,
  busy = false,
  sendoff,
  onDuel,
  onRematch,
  onExit,
}: {
  state: MatchState
  you: PlayerId
  rematchLabel: string
  busy?: boolean
  /** Tutorial-only: Lloyd's one-line sendoff under the heading. */
  sendoff?: string
  /** Tutorial-only: makes "Duel a friend" the coral primary action. */
  onDuel?: () => void
  onRematch: () => void
  onExit: () => void
}) {
  const me = state.players[you]
  const them = state.players[opponentOf(you)]
  const maxGold = Math.max(me.gold, them.gold)
  const heading =
    state.phase === 'VAULT_CLOSED'
      ? state.winner
        ? state.winner === you
          ? 'Chain complete — you win on points!'
          : `Chain complete — ${them.name} wins on points.`
        : 'Chain complete — dead heat!'
      : state.winner === you
        ? `${them.name} is out of lives — you win!`
        : `You're out of lives — ${them.name} wins.`
  return (
    <Overlay>
      <h2 className="text-2xl font-extrabold text-ink-strong">{heading}</h2>
      {sendoff && (
        <p className="font-bold text-ink text-[13.5px] max-w-xs -mt-1">
          <span className="font-extrabold text-p2-lip">LLOYD</span> — {sendoff}
        </p>
      )}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <GoldBar name={me.name} gold={me.gold} maxGold={maxGold} side="you" />
        <GoldBar name={them.name} gold={them.gold} maxGold={maxGold} side="them" />
      </div>
      <div className="flex flex-col items-start gap-2 max-h-44 overflow-y-auto px-2 py-1">
        {state.chain.map((link, i) => (
          <div key={i} className="flex items-center gap-2">
            <WordTiles
              word={link.word}
              side={sideOf(link.owner, you)}
              headTint={link.overlap}
              tailTint={state.chain[i + 1]?.overlap ?? 0}
              small
            />
            <span className="text-[10px] font-extrabold text-dim whitespace-nowrap">
              {i === 0 ? 'opener' : `+${link.gold}`}
              {link.challengeSurvived ? ' · real' : ''}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {onDuel && (
          <button
            onClick={onDuel}
            className="h-13 rounded-2xl font-extrabold bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5"
          >
            Duel a friend
          </button>
        )}
        <button
          onClick={onRematch}
          disabled={busy}
          className="h-13 rounded-2xl font-extrabold bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] active:translate-y-0.5 disabled:opacity-50"
        >
          {rematchLabel}
        </button>
        <button onClick={onExit} className="h-11 rounded-xl font-extrabold text-dim">
          Back home
        </button>
      </div>
    </Overlay>
  )
}
