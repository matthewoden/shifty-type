import { useState } from 'react'
import { ChainLedger } from '../components/ChainLedger'
import { Deck, PassButton } from '../components/Deck'
import { Toast } from '../components/Toast'
import { Hud } from '../components/Hud'
import { useComposer } from '../components/useComposer'
import { gripOptions } from '../game'
import {
  AccusePending,
  ConfirmChallengeSheet,
  DefendInterstitial,
  GameOverPanel,
  VerdictStamp,
} from '../components/overlays'
import { opponentOf } from '../game'
import { clearActiveCode } from '../multi/storage'
import { useMultiMatch, type StampEvent } from '../multi/useMultiMatch'
import { useClearBadge, useNudge, type NudgeStatus } from '../multi/useNudge'
import { BellOffSheet, SoftAskSheet } from '../components/NudgeSheets'
import { InviteSheet } from '../components/InviteSheet'
import { CallBellIcon, ShareIcon } from '../components/icons'

interface MultiMatchProps {
  code: string
  token: string
  onExit: () => void
}

export function MultiMatch({ code, token, onExit }: MultiMatchProps) {
  const m = useMultiMatch(code, token)
  const [confirmingChallenge, setConfirmingChallenge] = useState(false)
  // The invite sheet opens itself once the opener has played and rides atop
  // the board until a friend joins; dismissing it leaves a re-open button.
  const [inviteOpen, setInviteOpen] = useState(true)

  const view = m.view
  const newestWord =
    view && view.state.chain.length > 0
      ? view.state.chain[view.state.chain.length - 1].word
      : null
  const isMyTurn =
    !!view &&
    ((view.state.phase === 'P1_TURN' && view.you === 'p1') ||
      (view.state.phase === 'P2_TURN' && view.you === 'p2'))
  // Hook order stays stable across the early returns below. Busy doesn't
  // reset the draft — a failed send must leave the word intact to fix.
  const composer = useComposer(newestWord, isMyTurn)
  const nudge = useNudge(code, token)
  useClearBadge()
  // 'ask' = our friendly pre-prompt (guards the one-shot OS dialog);
  // 'fix' = the way back after a denied permission.
  const [bellSheet, setBellSheet] = useState<'ask' | 'fix' | null>(null)
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
        onExit={() => {
          clearActiveCode()
          onExit()
        }}
      />
    )
  }
  if (!m.view) {
    return <CenteredNote text="Opening your match…" pulse onExit={onExit} />
  }

  const { state, you, refereeOffline, presence } = m.view
  const oppName = state.players[opponentOf(you)].name
  const oppHere = presence?.[opponentOf(you)] ?? false
  const newest = state.chain[state.chain.length - 1]
  const terminal = state.phase === 'GAME_OVER' || state.phase === 'VAULT_CLOSED'
  // The friend hasn't taken their seat yet — the opener plays their word, then
  // hands off the invite. Only ever true for the opener (the joiner clears it).
  const awaiting = !!state.awaitingOpponent
  const openingNeeded = awaiting && isMyTurn && state.chain.length === 0

  const myTurn = isMyTurn
  const fan = myTurn && !composer.typed && newest ? gripOptions(newest.word) : null
  const defending =
    state.phase === 'CHALLENGE_PENDING' && state.challenger !== null && state.challenger !== you
  const accusing = state.phase === 'CHALLENGE_PENDING' && state.challenger === you
  const canChallenge =
    myTurn && newest !== undefined && newest.owner !== you && !newest.challengeSurvived

  const active =
    terminal
      ? null
      : state.phase === 'P1_TURN'
        ? ('p1' as const)
        : state.phase === 'P2_TURN'
          ? ('p2' as const)
          : state.challenger
            ? opponentOf(state.challenger)
            : null

  return (
    <div className="h-dvh bg-board flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3.5 pt-2 pb-2.5">
        <div className="flex items-center gap-2">
          <button onClick={onExit} className="h-11 px-2 font-extrabold text-[13px] text-dim">
            ← Home
          </button>
          <span className="font-extrabold text-[13px] text-dim tracking-widest">{code}</span>
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
        onSeed={composer.seed}
        onPlay={() => {
          void m.send({ type: 'play', word: composer.typed }).then((ok) => {
            if (ok) composer.clear()
          })
        }}
      />
      <Toast message={m.toast} />
      {m.error && (
        <div className="mx-3.5 mb-2 text-center text-[13px] font-bold text-p2-lip bg-white rounded-xl py-2 shadow-[0_3px_0_#E2DDD3]">
          {m.error}
        </div>
      )}
      {openingNeeded && (
        <p className="mx-3.5 mb-1 text-center text-[13px] font-bold text-ink-strong bg-white rounded-xl py-2 px-3 shadow-[0_3px_0_#E2DDD3]">
          Play your opening word — anything goes.{' '}
          <span className="font-semibold text-dim">You'll invite your friend the moment it lands.</span>
        </p>
      )}
      {myTurn ? (
        <Deck disabled={m.busy} rise onKey={composer.key} onBackspace={composer.backspace} />
      ) : awaiting ? (
        <div className="px-5 pb-10 pt-2 text-center">
          <p className="font-extrabold text-[15px] text-ink-strong">
            Waiting for your friend to take a seat…
          </p>
          <p className="font-semibold text-xs text-dim mt-1">
            {nudge.status === 'on'
              ? "we'll ring your phone's bell when they sit down"
              : 'share the invite and they drop straight into their turn'}
          </p>
          <button
            onClick={() => setInviteOpen(true)}
            className="mt-3 h-11 px-5 rounded-full bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5 inline-flex items-center gap-2 font-extrabold text-[13px]"
          >
            <ShareIcon className="w-4 h-4 text-white" /> Invite a friend
          </button>
        </div>
      ) : (
        <div className="px-5 pb-10 pt-2 text-center">
          <p className="font-extrabold text-[15px] text-ink-strong">
            {oppHere ? (
              <>
                <PresenceDot /> {oppName}'s at the table, mulling it over…
              </>
            ) : (
              <>{oppName}'s move — we'll be here.</>
            )}
          </p>
          <p className="font-semibold text-xs text-dim mt-1">
            {nudge.status === 'on'
              ? "we'll ring your phone's bell the moment they play"
              : m.live
                ? 'their word lands right here the moment they play it'
                : 'checks for their word every few seconds while you watch'}
          </p>
          <BellButton
            status={nudge.status}
            label="Ring me when they play"
            className="mt-3"
            onAsk={() => setBellSheet('ask')}
            onFix={() => setBellSheet('fix')}
          />
        </div>
      )}

      {confirmingChallenge && newest && (
        <ConfirmChallengeSheet
          onConfirm={() => {
            setConfirmingChallenge(false)
            void m.send({ type: 'challenge' })
          }}
          onCancel={() => setConfirmingChallenge(false)}
        />
      )}
      {defending && newest && !m.stamp && (
        <DefendInterstitial
          word={newest.word}
          oppName={oppName}
          resolving={m.busy}
          offline={refereeOffline}
          onStand={() => void m.send({ type: 'stand' })}
          onFold={() => void m.send({ type: 'fold' })}
          onCoinFlip={() => void m.send({ type: 'coinflip' })}
        />
      )}
      {accusing && newest && !m.stamp && (
        <AccusePending
          word={newest.word}
          waitingCopy={`${oppName} must fold or stand…`}
          offline={refereeOffline}
          onCoinFlip={() => void m.send({ type: 'coinflip' })}
        />
      )}
      {awaiting && !myTurn && inviteOpen && (
        <InviteSheet
          code={code}
          openingWord={state.chain[0]?.word ?? null}
          bell={
            <BellButton
              status={nudge.status}
              label="Ring me when they sit down"
              onAsk={() => setBellSheet('ask')}
              onFix={() => setBellSheet('fix')}
            />
          }
          onClose={() => setInviteOpen(false)}
        />
      )}
      {m.stamp && <MultiVerdict stamp={m.stamp} you={you} oppName={oppName} onDismiss={m.clearStamp} />}
      {terminal && !m.stamp && (
        <GameOverPanel
          state={state}
          you={you}
          rematchLabel="Rematch (openers swap)"
          busy={m.busy}
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
      className={`h-11 px-4 rounded-full bg-white shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5 inline-flex items-center gap-2 font-extrabold text-[13px] disabled:opacity-60 ${denied ? 'text-dim' : 'text-ink'} ${className}`}
    >
      <CallBellIcon className={`w-4 h-4 ${denied ? 'text-dim' : 'text-p1-lip'}`} />
      {denied ? "The bell's off — turn it back on" : status === 'pending' ? 'Asking…' : label}
    </button>
  )
}

/** The little "seat's warm" lamp next to a present opponent. */
function PresenceDot() {
  return (
    <span
      aria-hidden
      className="inline-block w-2 h-2 rounded-full bg-p2 align-middle mr-0.5 -mt-0.5 animate-pulse motion-reduce:animate-none"
    />
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
  const mine = stamp.by === you // the local player was the defender
  const flip = 'coinFlip' in stamp && stamp.coinFlip ? ' The coin decided.' : ''
  if (stamp.kind === 'fold') {
    return mine ? (
      <VerdictStamp
        stamp="FOLDED"
        good={false}
        copy={`You fold. ${word} is struck from the chain and you lose a life.`}
        onDismiss={onDismiss}
      />
    ) : (
      <VerdictStamp
        stamp="FOLDED"
        good
        copy={`${oppName} folds! ${word} is struck from the chain and ${oppName} loses a life.`}
        onDismiss={onDismiss}
      />
    )
  }
  if (stamp.kind === 'real') {
    return mine ? (
      <VerdictStamp
        stamp="REAL"
        good
        copy={`${word} stands.${flip} ${oppName} loses a life for doubting you.`}
        onDismiss={onDismiss}
      />
    ) : (
      <VerdictStamp
        stamp="REAL"
        good={false}
        copy={`${oppName} stands, and the ruling is in.${flip} ${word} is real — you lose a life.`}
        onDismiss={onDismiss}
      />
    )
  }
  return mine ? (
    <VerdictStamp
      stamp="FAKE"
      good={false}
      copy={`Busted.${flip} ${word} is struck from the chain and you lose a life.`}
      onDismiss={onDismiss}
    />
  ) : (
    <VerdictStamp
      stamp="FAKE"
      good
      copy={`Busted!${flip} ${word} was a fake — ${oppName} loses a life.`}
      onDismiss={onDismiss}
    />
  )
}

function CenteredNote({
  text,
  hint,
  pulse,
  onExit,
}: {
  text: string
  hint?: string
  pulse?: boolean
  onExit: () => void
}) {
  return (
    <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p
        className={`text-ink-strong font-extrabold text-lg ${pulse ? 'animate-pulse motion-reduce:animate-none' : ''}`}
      >
        {text}
      </p>
      {hint && <p className="text-ink font-semibold text-sm max-w-xs">{hint}</p>}
      <button onClick={onExit} className="h-11 px-4 font-extrabold text-dim">
        ← Back to the hideout
      </button>
    </div>
  )
}
