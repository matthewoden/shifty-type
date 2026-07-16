import { useState } from 'react'
import { ChainLedger } from '../components/ChainLedger'
import { Deck, PassButton } from '../components/Deck'
import { Toast } from '../components/Toast'
import { Hud } from '../components/Hud'
import { useComposer } from '../components/useComposer'
import { gripOptions, gripTargetOf, isChainBroken, lastCallActorOf } from '../game'
import { ConfirmChallengeSheet, GameOverPanel, VerdictStamp } from '../components/overlays'
import { LastCallBar } from '../components/LastCallBar'
import { useSoloMatch, type SoloEvent, type SoloSave } from '../solo/useSoloMatch'

interface SoloMatchProps {
  save: SoloSave
  onExit: () => void
  /** Where the back button returns to, for its label ("Home" or "Games"). */
  backLabel?: string
}

export function SoloMatch({ save, onExit, backLabel = 'Home' }: SoloMatchProps) {
  const m = useSoloMatch(save)
  const [confirmingChallenge, setConfirmingChallenge] = useState(false)

  const { state } = m
  const botName = state.players.p2.name
  const newest = state.chain[state.chain.length - 1]
  const playerTurn = state.phase === 'P1_TURN'
  // The bot played the final word; the player answers last call.
  const playerLastCall = state.phase === 'LAST_CALL' && lastCallActorOf(state) === 'p1'
  // Both passed on the tip: the chain snapped, and the next word opens fresh —
  // no grip to compose against, no fan, and the sealed tip is unchallengeable.
  const broken = isChainBroken(state)
  const gripTarget = gripTargetOf(state)
  const composer = useComposer(gripTarget?.word ?? null, playerTurn)
  const fan = playerTurn && !composer.typed && gripTarget ? gripOptions(gripTarget.word) : null
  const canChallenge =
    (playerTurn || playerLastCall) &&
    newest !== undefined &&
    newest.owner === 'p2' &&
    !newest.challengeSurvived &&
    !broken

  const active = m.terminal
    ? null
    : state.phase === 'LAST_CALL'
      ? lastCallActorOf(state)
      : state.phase === 'P1_TURN'
        ? ('p1' as const)
        : state.phase === 'P2_TURN'
          ? ('p2' as const)
          : null

  return (
    <div className="h-dvh bg-board flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3.5 pt-2 pb-2.5">
        <button onClick={onExit} className="h-11 px-2 font-extrabold text-[13px] text-dim">
          ← {backLabel}
        </button>
        <PassButton disabled={!playerTurn} onPass={m.pass} />
      </div>
      <Hud state={state} you="p1" active={active} pulse={m.botThinking} />
      <ChainLedger
        chain={state.chain}
        you="p1"
        players={state.players}
        canChallenge={canChallenge}
        onChallenge={() => setConfirmingChallenge(true)}
        composer={composer.typed ? composer : null}
        fan={fan}
        openerCaret={playerTurn && state.chain.length === 0}
        freshStart={broken && !m.terminal ? (playerTurn ? 'mine' : 'theirs') : null}
        onSeed={composer.seed}
        onPlay={() => {
          if (m.playWord(composer.typed)) composer.clear()
        }}
      />
      <Toast
        message={
          m.event?.kind === 'bot-passed'
            ? `${botName} is stuck and passes — a life slips away.`
            : m.event?.kind === 'snapped'
              ? m.event.by === 'p2'
                ? `${botName} is stuck too — snap!`
                : `You're both stuck — snap!`
              : m.event?.kind === 'referee-error'
                ? "Couldn't get a ruling — check your connection and flag it again."
                : null
        }
      />
      {m.error && (
        <div className="mx-3.5 mb-2 text-center text-[13px] font-bold text-p2-lip bg-white rounded-xl px-4 py-2.5 shadow-[0_3px_0_#E2DDD3]">
          {m.error}
        </div>
      )}
      {playerLastCall && newest ? (
        <LastCallBar finisherName={botName} word={newest.word} onShake={m.shake} />
      ) : (
        <Deck
          disabled={!playerTurn}
          keyHints={playerTurn ? composer.keyHints : null}
          onKey={composer.key}
          onBackspace={composer.backspace}
        />
      )}

      {confirmingChallenge && newest && (
        <ConfirmChallengeSheet
          onConfirm={() => {
            setConfirmingChallenge(false)
            void m.challengeBot()
          }}
          onCancel={() => setConfirmingChallenge(false)}
        />
      )}
      {m.event?.kind === 'verdict' && (
        <SoloVerdict event={m.event} botName={botName} onDismiss={m.clearEvent} />
      )}
      {m.terminal && (
        <GameOverPanel
          state={state}
          you="p1"
          rematchLabel={`Rematch (${m.opener === 'p1' ? `${botName} opens` : 'you open'})`}
          backLabel={backLabel === 'Games' ? 'Games' : 'home'}
          onRematch={m.rematch}
          onExit={onExit}
        />
      )}
    </div>
  )
}

export function SoloVerdict({
  event,
  botName,
  onDismiss,
}: {
  event: Extract<SoloEvent, { kind: 'verdict' }>
  botName: string
  onDismiss: () => void
}) {
  const word = event.word.toUpperCase()
  const iChallenged = event.challenger === 'p1'
  if (event.real) {
    // STANDS — the challenger loses a life for the bad call.
    return (
      <VerdictStamp
        stamp="STANDS"
        copy={
          iChallenged
            ? `The ruling: ${word} holds up. You lose a life for the call.`
            : `${botName} flagged ${word}, but it holds up. ${botName} loses a life.`
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
          ? `The ruling: ${word} isn't a word. It's struck and ${botName} loses a life.`
          : `${botName} flagged ${word} — busted. It's struck and you lose a life.`
      }
      onDismiss={onDismiss}
    />
  )
}
