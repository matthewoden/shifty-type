import { useEffect, useRef, useState } from 'react'
import { ChainLedger } from '../components/ChainLedger'
import { Deck, PassButton } from '../components/Deck'
import { Toast } from '../components/Toast'
import { Hud } from '../components/Hud'
import { PresenceDot } from '../components/PresenceDot'
import { useComposer } from '../components/useComposer'
import { useDeckKeyboard } from '../components/useDeckKeyboard'
import { gripOptions, isChainBroken, lastCallActorOf } from '../game'
import { ConfirmChallengeSheet, GameOverPanel, VerdictStamp } from '../components/overlays'
import { opponentOf } from '../game'
import {
  clearActiveCode,
  loadSeenNewest,
  removeMatchAuth,
  saveSeenNewest,
} from '../multi/storage'
import { useMultiMatch, type StampEvent } from '../multi/useMultiMatch'
import { useClearBadge, useNudge, type NudgeStatus } from '../multi/useNudge'
import { BellOffSheet, SoftAskSheet } from '../components/NudgeSheets'
import { InviteSheet } from '../components/InviteSheet'
import { NoteSheet } from '../components/NoteSheet'
import { CallBellIcon, PaperPlaneTiltIcon, ShareIcon } from '../components/icons'
import { LastCallBar } from '../components/LastCallBar'
import { Button } from '../components/ui/Button'

interface MultiMatchProps {
  code: string
  token: string
  onExit: () => void
  /** Where the back button returns to, for its label ("Home" or "Games"). */
  backLabel?: string
}

export function MultiMatch({ code, token, onExit, backLabel = 'Home' }: MultiMatchProps) {
  const m = useMultiMatch(code, token)
  const [confirmingChallenge, setConfirmingChallenge] = useState(false)
  // The invite sheet opens itself once the opener has played and rides atop
  // the board until a friend joins; dismissing it leaves a re-open button.
  const [inviteOpen, setInviteOpen] = useState(true)

  const view = m.view
  // Both players passed on the tip: the chain snapped — the next word opens
  // fresh, so the composer grips nothing and the sealed tip can't be flagged.
  const broken = !!view && isChainBroken(view.state)
  const newestWord =
    view && view.state.chain.length > 0 && !broken
      ? view.state.chain[view.state.chain.length - 1].word
      : null
  const isMyTurn =
    !!view &&
    ((view.state.phase === 'P1_TURN' && view.you === 'p1') ||
      (view.state.phase === 'P2_TURN' && view.you === 'p2'))
  // Hook order stays stable across the early returns below. Busy doesn't
  // reset the draft — a failed send must leave the word intact to fix.
  const composer = useComposer(newestWord, isMyTurn)
  // Decided once, when the match first paints: a friend's word that landed
  // while the player was away types itself in (words arriving while watching
  // are the ledger's own live detection). Then the newest row is marked seen
  // so re-opening the match doesn't replay the reveal.
  const newestRowKey =
    view && view.state.chain.length > 0
      ? `${view.state.chain.length - 1}-${view.state.chain[view.state.chain.length - 1].word}`
      : null
  const revealRef = useRef<boolean | null>(null)
  if (view && revealRef.current === null) {
    const last = view.state.chain[view.state.chain.length - 1]
    revealRef.current = !!last && last.owner !== view.you && newestRowKey !== loadSeenNewest(code)
  }
  useEffect(() => {
    if (newestRowKey) saveSeenNewest(code, newestRowKey)
  }, [code, newestRowKey])
  const nudge = useNudge(code, token)
  useClearBadge()
  // 'ask' = our friendly pre-prompt (guards the one-shot OS dialog);
  // 'fix' = the way back after a denied permission.
  const [bellSheet, setBellSheet] = useState<'ask' | 'fix' | null>(null)
  // The note sheet — the nudge that rides a regular text instead of push.
  const [noteOpen, setNoteOpen] = useState(false)

  const playTyped = () => {
    void m.send({ type: 'play', word: composer.typed }).then((ok) => {
      if (ok) composer.clear()
    })
  }
  // Desktop: physical keys drive the same composer as the on-screen deck.
  useDeckKeyboard(
    isMyTurn && !m.busy && !confirmingChallenge && !bellSheet && !noteOpen && !m.stamp,
    {
      onKey: composer.key,
      onBackspace: composer.backspace,
      onPlay: () => {
        if (composer.canPlay && !m.busy) playTyped()
      },
    },
  )
  const bellSheets = bellSheet && (
    bellSheet === 'ask' ? (
      <SoftAskSheet
        onConfirm={() => {
          setBellSheet(null)
          void nudge.enable()
        }}
        onClose={() => setBellSheet(null)}
      />
    ) : (
      <BellOffSheet onClose={() => setBellSheet(null)} />
    )
  )

  if (m.lost) {
    return (
      <CenteredNote
        text={m.lost}
        hint="This match may have expired, or the link belongs to another device."
        backLabel={backLabel}
        onExit={() => {
          clearActiveCode()
          onExit()
        }}
      />
    )
  }
  if (!m.view) {
    return <CenteredNote text="Opening your match…" pulse backLabel={backLabel} onExit={onExit} />
  }

  const { state, you, presence } = m.view
  const oppName = state.players[opponentOf(you)].name
  const oppHere = presence?.[opponentOf(you)] ?? false
  const newest = state.chain[state.chain.length - 1]
  const terminal = state.phase === 'GAME_OVER' || state.phase === 'CHAIN_COMPLETE'
  // The chain is full; whoever didn't play the final word answers last call.
  const lastCall = state.phase === 'LAST_CALL'
  const myLastCall = lastCall && lastCallActorOf(state) === you
  // The friend hasn't taken their seat yet — the opener plays their word, then
  // hands off the invite. Only ever true for the opener (the joiner clears it).
  const awaiting = !!state.awaitingOpponent
  const openingNeeded = awaiting && isMyTurn && state.chain.length === 0

  const myTurn = isMyTurn
  const fan = myTurn && !composer.typed && newest && !broken ? gripOptions(newest.word) : null
  const canChallenge =
    (myTurn || myLastCall) &&
    newest !== undefined &&
    newest.owner !== you &&
    !newest.challengeSurvived &&
    !broken

  const active = terminal
    ? null
    : lastCall
      ? lastCallActorOf(state)
      : state.phase === 'P1_TURN'
        ? ('p1' as const)
        : state.phase === 'P2_TURN'
          ? ('p2' as const)
          : null

  return (
    <div className="h-dvh bg-board flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3.5 pt-2 pb-2.5">
        <div className="flex items-center gap-2">
          <Button
            variant="text"
            size="sm"
            onClick={() => {
              // A duel you opened but never played a word into is nothing yet —
              // don't leave it lying around as a resumable "trash" game.
              if (state.chain.length === 0 && state.awaitingOpponent) {
                removeMatchAuth(code)
                clearActiveCode()
              }
              onExit()
            }}
          >
            ← {backLabel}
          </Button>
          <span className="font-extrabold text-ui text-dim tracking-widest">{code}</span>
        </div>
        <PassButton disabled={!myTurn || m.busy} onPass={() => void m.send({ type: 'pass' })} />
      </div>
      <Hud state={state} you={you} active={active} />
      <ChainLedger
        chain={state.chain}
        you={you}
        players={state.players}
        canChallenge={canChallenge}
        onChallenge={() => setConfirmingChallenge(true)}
        composer={composer.typed ? composer : null}
        fan={fan}
        openerCaret={isMyTurn && state.chain.length === 0}
        freshStart={broken && !terminal && !lastCall ? (myTurn ? 'mine' : 'theirs') : null}
        revealOnMount={revealRef.current ?? false}
        onSeed={composer.seed}
        onPlay={playTyped}
      />
      <Toast message={m.toast} />
      {m.error && (
        <div className="mx-3.5 mb-2 text-center text-body font-bold text-p2-lip bg-white rounded-xl px-4 py-2.5 shadow-[0_3px_0_#E2DDD3]">
          {m.error}
        </div>
      )}
      {openingNeeded && (
        <p className="mx-3.5 mb-1 text-center text-body font-bold text-ink-strong bg-white rounded-xl py-2 px-3 shadow-[0_3px_0_#E2DDD3]">
          Play your opening word — anything goes.{' '}
          <span className="font-semibold text-dim">You'll invite your friend the moment it lands.</span>
        </p>
      )}
      {myTurn ? (
        <Deck
          disabled={m.busy}
          rise
          keyHints={composer.keyHints}
          onKey={composer.key}
          onBackspace={composer.backspace}
        />
      ) : myLastCall && newest ? (
        <LastCallBar
          finisherName={oppName}
          word={newest.word}
          busy={m.busy}
          onShake={() => void m.send({ type: 'accept' })}
        />
      ) : awaiting ? (
        <div className="px-5 pb-10 pt-2 text-center">
          <p className="font-extrabold text-status text-ink-strong">
            Waiting for your friend to jump in…
          </p>
          <p className="font-semibold text-caption text-dim mt-1">
            {nudge.status === 'on'
              ? "we'll notify you when they jump in"
              : 'share the invite and they drop straight into their turn'}
          </p>
          <Button variant="pill" accent="p2" onClick={() => setInviteOpen(true)} className="mt-3">
            <ShareIcon className="w-4 h-4 text-white" /> Invite a friend
          </Button>
        </div>
      ) : lastCall ? (
        <div className="px-5 pb-10 pt-2 text-center">
          <p className="font-extrabold text-status text-ink-strong">
            {oppHere ? (
              <>
                <PresenceDot /> {oppName}'s eyeing your last word…
              </>
            ) : (
              <>Your last word is waiting for an answer.</>
            )}
          </p>
          <p className="font-semibold text-caption text-dim mt-1">
            {oppName} ends the match by shaking on it — or challenging it
          </p>
          <div className="mt-3 flex flex-col items-center gap-2">
            <BellButton
              status={nudge.status}
              label="Notify me when they answer"
              onAsk={() => setBellSheet('ask')}
              onFix={() => setBellSheet('fix')}
            />
            {!oppHere && <NotePill onOpen={() => setNoteOpen(true)} />}
          </div>
        </div>
      ) : (
        <div className="px-5 pb-10 pt-2 text-center">
          <p className="font-extrabold text-status text-ink-strong">
            {oppHere ? (
              <>
                <PresenceDot /> {oppName}'s here, mulling it over…
              </>
            ) : broken ? (
              <>{oppName} starts a fresh chain — we'll be here.</>
            ) : (
              <>{oppName}'s move — we'll be here.</>
            )}
          </p>
          <p className="font-semibold text-caption text-dim mt-1">
            {nudge.status === 'on'
              ? "we'll notify you the moment they play"
              : m.live
                ? 'their word lands right here the moment they play it'
                : 'checks for their word every few seconds while you watch'}
          </p>
          <div className="mt-3 flex flex-col items-center gap-2">
            <BellButton
              status={nudge.status}
              label="Notify me when they play"
              onAsk={() => setBellSheet('ask')}
              onFix={() => setBellSheet('fix')}
            />
            {!oppHere && <NotePill onOpen={() => setNoteOpen(true)} />}
          </div>
        </div>
      )}

      {confirmingChallenge && newest && (
        <ConfirmChallengeSheet
          word={newest.word}
          onConfirm={() => {
            setConfirmingChallenge(false)
            void m.send({ type: 'challenge' })
          }}
          onCancel={() => setConfirmingChallenge(false)}
        />
      )}
      {awaiting && !myTurn && inviteOpen && (
        <InviteSheet
          code={code}
          openingWord={state.chain[0]?.word ?? null}
          bell={
            <BellButton
              status={nudge.status}
              label="Notify me when they jump in"
              onAsk={() => setBellSheet('ask')}
              onFix={() => setBellSheet('fix')}
            />
          }
          onClose={() => setInviteOpen(false)}
        />
      )}
      {noteOpen && (
        <NoteSheet
          code={code}
          friendName={oppName}
          tableWord={newestWord}
          onClose={() => setNoteOpen(false)}
        />
      )}
      {m.stamp && <MultiVerdict stamp={m.stamp} you={you} oppName={oppName} onDismiss={m.clearStamp} />}
      {terminal && !m.stamp && (
        <GameOverPanel
          state={state}
          you={you}
          rematchLabel="Rematch (openers swap)"
          busy={m.busy}
          backLabel={backLabel === 'Games' ? 'Games' : 'home'}
          onRematch={() => void m.rematch()}
          onExit={() => {
            clearActiveCode()
            onExit()
          }}
        />
      )}
      {bellSheets}
    </div>
  )
}

/** The nudge that needs no permission: opens the note sheet. Callers hide it
 *  while the friend is actually at the table — you don't slide a note to
 *  someone sitting across from you. */
function NotePill({ onOpen }: { onOpen: () => void }) {
  return (
    <Button variant="pill" accent="white" onClick={onOpen}>
      <PaperPlaneTiltIcon className="w-4 h-4 text-p2-lip" />
      Slide them a note
    </Button>
  )
}

/** One pill for every bell state: invites the tap, shows the ask in flight,
 *  and — after a denied permission — offers the road back instead of
 *  vanishing. */
function BellButton({
  status,
  label,
  className = '',
  onAsk,
  onFix,
}: {
  status: NudgeStatus
  label: string
  className?: string
  onAsk: () => void
  onFix: () => void
}) {
  if (status !== 'off' && status !== 'pending' && status !== 'denied') return null
  const denied = status === 'denied'
  return (
    <button
      onClick={denied ? onFix : onAsk}
      disabled={status === 'pending'}
      className={`h-11 px-4 rounded-full bg-white shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5 inline-flex items-center gap-2 font-extrabold text-ui disabled:opacity-60 ${denied ? 'text-dim' : 'text-ink'} ${className}`}
    >
      <CallBellIcon className={`w-4 h-4 ${denied ? 'text-dim' : 'text-p1-lip'}`} />
      {denied ? "Notifications are off — turn them back on" : status === 'pending' ? 'Asking…' : label}
    </button>
  )
}

function MultiVerdict({
  stamp,
  you,
  oppName,
  onDismiss,
}: {
  stamp: StampEvent
  you: string
  oppName: string
  onDismiss: () => void
}) {
  const word = stamp.word.toUpperCase()
  const iChallenged = stamp.by === you // the local player flagged the word
  if (stamp.kind === 'real') {
    // STANDS — the challenger loses a life for the bad call.
    return (
      <VerdictStamp
        stamp="STANDS"
        copy={
          iChallenged
            ? `The ruling: ${word} holds up. You lose a life for the call.`
            : `${oppName} flagged ${word}, but it holds up. ${oppName} loses a life.`
        }
        onDismiss={onDismiss}
      />
    )
  }
  // REJECTED — the word is struck and its owner loses a life.
  return (
    <VerdictStamp
      stamp="REJECTED"
      copy={
        iChallenged
          ? `The ruling: ${word} isn't a word. It's struck and ${oppName} loses a life.`
          : `${oppName} flagged ${word} — busted. It's struck and you lose a life.`
      }
      onDismiss={onDismiss}
    />
  )
}

function CenteredNote({
  text,
  hint,
  pulse,
  onExit,
  backLabel = 'Home',
}: {
  text: string
  hint?: string
  pulse?: boolean
  onExit: () => void
  backLabel?: string
}) {
  return (
    <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p
        className={`text-ink-strong font-extrabold text-lg ${pulse ? 'animate-pulse motion-reduce:animate-none' : ''}`}
      >
        {text}
      </p>
      {hint && <p className="text-ink font-semibold text-small max-w-xs">{hint}</p>}
      <Button variant="text" onClick={onExit}>
        ← {backLabel}
      </Button>
    </div>
  )
}
