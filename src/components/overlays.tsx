// Full-screen match moments shared by solo and multiplayer: the challenge
// confirm sheet, the STANDS/REJECTED verdict stamp, and the game-over panel
// with its points count-up.

import { useEffect, useState } from 'react'
import { opponentOf, type MatchState, type PlayerId } from '../game'
import { playerTextClass, sideOf, tileClass, type Side } from './tiles'
import { TileRail } from './WordTiles'
import { FlagIcon } from './icons'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'

export function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 max-w-[430px] mx-auto bg-board/95 flex flex-col items-center justify-center gap-5 p-8 text-center z-10">
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

/**
 * The ruling, stamped on the word. Color is the verdict, not the viewer:
 * REJECTED is always red (a word died), STANDS always the blue-grey p1-lip
 * (a word held). The copy — who lost a life — is supplied by the caller.
 */
export function VerdictStamp({
  stamp,
  copy,
  onDismiss,
}: {
  stamp: 'STANDS' | 'REJECTED'
  copy: string
  onDismiss: () => void
}) {
  const color =
    stamp === 'REJECTED' ? 'text-verdict-no border-verdict-no' : 'text-p1-lip border-p1-lip'
  return (
    <Overlay>
      <div
        className={`font-extrabold text-4xl tracking-widest border-4 rounded-xl px-6 py-2 -rotate-6 stamp-in ${color}`}
      >
        {stamp}
      </div>
      <p className="text-ink font-bold max-w-xs break-words">{copy}</p>
      <Button variant="cta" accent="ink" onClick={onDismiss} className="px-8">
        Continue
      </Button>
    </Overlay>
  )
}

export function ConfirmChallengeSheet({
  word,
  whisper,
  onConfirm,
  onCancel,
}: {
  /** The word on trial — always the friend's (you can't challenge your own). */
  word: string
  /** Tutorial-only: one italic line under the buttons. */
  whisper?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet onClose={onCancel}>
      {(close) => (
        <>
          {/* The word on trial rides a rail — a long one swipes to read. */}
          <TileRail word={word} side="them" />
          <p className="font-bold text-ink text-status">
            Challenge this word? Incorrect answers lose a life.
          </p>
          <Button variant="cta" accent="p2" onClick={onConfirm}>
            <FlagIcon className="w-5 h-5 text-white" /> Not a word!
          </Button>
          <Button variant="text" onClick={close}>
            Never mind
          </Button>
          {whisper && (
            <p className="text-center text-caption font-bold italic text-dim -mt-1">{whisper}</p>
          )}
        </>
      )}
    </Sheet>
  )
}

/** Counts 0 → target once on mount; jumps straight there under reduced motion. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    // No run-once ref: the rAF cleanup already handles re-runs, and a ref
    // guard left the count stuck at 0 under StrictMode's double effect.
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

function PointsBar({
  name,
  points,
  maxPoints,
  side,
}: {
  name: string
  points: number
  maxPoints: number
  side: Side
}) {
  const shown = useCountUp(points)
  const pct = maxPoints > 0 ? Math.max(8, (points / maxPoints) * 100) : 8
  const fill =
    side === 'you'
      ? 'bg-p1 shadow-[0_3px_0_var(--color-p1-lip)]'
      : 'bg-p2 shadow-[0_3px_0_var(--color-p2-lip)]'
  return (
    <div className="w-full">
      <div className="flex justify-between font-extrabold text-body">
        <span className={playerTextClass(side)}>{name}</span>
        <span className="text-ink-strong">{shown} pts</span>
      </div>
      {/* No overflow-hidden: it sheared off the fill's lip shadow, leaving
          the bars flat next to everything else on the table. Track and fill
          wear lips like the HUD's life pips — grey where empty, colored
          where filled, both hanging 3px below the same bottom edge. */}
      <div className="h-4 bg-board-lo rounded-full mt-1 shadow-[0_3px_0_#DDD8CE]">
        <div
          className={`h-full rounded-full ${fill} motion-safe:transition-[width] motion-safe:duration-1000 points-bar`}
          style={{ ['--points-w' as string]: `${pct}%` }}
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
  primary,
  onRematch,
  onExit,
  backLabel = 'home',
}: {
  state: MatchState
  you: PlayerId
  rematchLabel: string
  busy?: boolean
  /** Tutorial-only: Lloyd's one-line sendoff under the heading. */
  sendoff?: string
  /** Tutorial-only: the coral primary action above Rematch — "Challenge a friend"
   *  for a cold-open player, or "Play your turn against {inviter}" when they
   *  came in from an invite. */
  primary?: { label: string; onClick: () => void }
  onRematch: () => void
  onExit: () => void
  /** Where the exit button returns to, for its label ("home" or "Games"). */
  backLabel?: string
}) {
  const me = state.players[you]
  const them = state.players[opponentOf(you)]
  const maxPoints = Math.max(me.points, them.points)
  const heading =
    state.phase === 'CHAIN_COMPLETE'
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
      <h2 className="text-title font-extrabold text-ink-strong">{heading}</h2>
      {sendoff && (
        <p className="font-bold text-ink text-body max-w-xs -mt-1">
          <span className="font-extrabold text-p2-lip">LLOYD</span> — {sendoff}
        </p>
      )}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <PointsBar name={me.name} points={me.points} maxPoints={maxPoints} side="you" />
        <PointsBar name={them.name} points={them.points} maxPoints={maxPoints} side="them" />
      </div>
      {/* The chain recap: one row per word. Long words ride a rail under
          edge fades (swipe to read) instead of folding — the match is over,
          nothing is being ruled on here, and the column stays scannable. */}
      <div className="flex flex-col items-start gap-2 max-h-44 overflow-y-auto px-2 py-1 w-full">
        {state.chain.map((link, i) => (
          <div key={i} className="flex items-center gap-2 w-full">
            <TileRail
              word={link.word}
              side={sideOf(link.owner, you)}
              headTint={link.overlap}
              tailTint={state.chain[i + 1]?.overlap ?? 0}
              small
              className="flex-1 min-w-0"
            />
            <span className="text-note font-extrabold text-dim whitespace-nowrap">
              {i === 0 ? 'opener' : `+${link.points}`}
              {link.challengeSurvived ? ' · real' : ''}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {primary && (
          <Button variant="cta" accent="p2" onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
        <Button variant="cta" accent="p1" onClick={onRematch} disabled={busy}>
          {rematchLabel}
        </Button>
        <Button variant="text" onClick={onExit}>
          {backLabel === 'home' ? 'Back home' : `Back to ${backLabel}`}
        </Button>
      </div>
    </Overlay>
  )
}
