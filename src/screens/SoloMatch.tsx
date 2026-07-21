import { useState } from 'react'
import { ChainLedger } from '../components/ChainLedger'
import { Deck, PassButton } from '../components/Deck'
import { Toast } from '../components/Toast'
import { Hud } from '../components/Hud'
import { PresenceDot } from '../components/PresenceDot'
import { useComposer } from '../components/useComposer'
import { useDeckKeyboard } from '../components/useDeckKeyboard'
import { gripOptions, gripTargetOf, isChainBroken, lastCallActorOf } from '../game'
import { ConfirmChallengeSheet, GameOverPanel, VerdictStamp } from '../components/overlays'
import { LastCallBar } from '../components/LastCallBar'
import { Button } from '../components/ui/Button'
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
  // The player played the final word; the bot is eyeing it.
  const botLastCall = state.phase === 'LAST_CALL' && lastCallActorOf(state) === 'p2'
  // The bot has the move — the deck gives way to the table-side note, same
  // as waiting on a friend in multiplayer, so the llama visibly "thinks".
  const botTurn = state.phase === 'P2_TURN' || botLastCall
  // Both passed on the tip: the chain snapped, and the next word opens fresh —
  // no grip to compose against, no fan, and the sealed tip is unchallengeable.
  const broken = isChainBroken(state)
  const gripTarget = gripTargetOf(state)
  const composer = useComposer(gripTarget?.word ?? null, playerTurn)
  const fan = playerTurn && !composer.typed && gripTarget ? gripOptions(gripTarget.word) : null

  const playTyped = () => {
    if (m.playWord(composer.typed)) composer.clear()
  }
  // Desktop: physical keys drive the same composer as the on-screen deck.
  useDeckKeyboard(
    playerTurn && !confirmingChallenge && m.event?.kind !== 'verdict' && !m.terminal,
    {
      onKey: composer.key,
      onBackspace: composer.backspace,
      onPlay: () => {
        if (composer.canPlay) playTyped()
      },
    },
  )
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
      <div className="hud-drop">
        <div className="flex items-center justify-between px-3.5 pt-2 pb-2.5">
          <Button variant="text" size="sm" onClick={onExit}>
            ← {backLabel}
          </Button>
          <PassButton disabled={!playerTurn} onPass={m.pass} />
        </div>
        <Hud state={state} you="p1" active={active} pulse={m.botThinking} />
      </div>
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
        onPlay={playTyped}
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
        <div className="mx-3.5 mb-2 text-center text-body font-bold text-p2-lip bg-white rounded-xl px-4 py-2.5 shadow-[0_3px_0_#E2DDD3]">
          {m.error}
        </div>
      )}
      {playerLastCall && newest ? (
        <LastCallBar finisherName={botName} word={newest.word} onShake={m.shake} />
      ) : botTurn ? (
        <div className="px-5 pb-10 pt-2 text-center">
          <p className="font-extrabold text-status text-ink-strong">
            <PresenceDot />{' '}
            {botLastCall
              ? `${botName}'s eyeing your last word…`
              : `${botName}'s here, mulling it over…`}
          </p>
        </div>
      ) : (
        <Deck
          disabled={!playerTurn}
          rise
          keyHints={playerTurn ? composer.keyHints : null}
          onKey={composer.key}
          onBackspace={composer.backspace}
        />
      )}

      {confirmingChallenge && newest && (
        <ConfirmChallengeSheet
          word={newest.word}
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
