import { useState } from 'react'
import { ChainLedger } from '../components/ChainLedger'
import { Deck, PassButton } from '../components/Deck'
import { Toast } from '../components/Toast'
import { Hud } from '../components/Hud'
import { useComposer } from '../components/useComposer'
import { gripOptions, opponentOf } from '../game'
import {
  AccusePending,
  ConfirmChallengeSheet,
  DefendInterstitial,
  GameOverPanel,
  VerdictStamp,
} from '../components/overlays'
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
  const composer = useComposer(newest?.word ?? null, playerTurn)
  const fan = playerTurn && !composer.typed && newest ? gripOptions(newest.word) : null
  const canChallenge =
    playerTurn && newest !== undefined && newest.owner === 'p2' && !newest.challengeSurvived

  const defending = state.phase === 'CHALLENGE_PENDING' && state.challenger === 'p2'
  const accusing = state.phase === 'CHALLENGE_PENDING' && state.challenger === 'p1'

  const active =
    m.terminal
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
        onSeed={composer.seed}
        onPlay={() => {
          if (m.playWord(composer.typed)) composer.clear()
        }}
      />
      <Toast
        message={
          m.event?.kind === 'bot-passed'
            ? `${botName} is stuck and passes — a life slips away.`
            : null
        }
      />
      {m.error && (
        <div className="mx-3.5 mb-2 text-center text-[13px] font-bold text-p2-lip bg-white rounded-xl py-2 shadow-[0_3px_0_#E2DDD3]">
          {m.error}
        </div>
      )}
      <Deck disabled={!playerTurn} onKey={composer.key} onBackspace={composer.backspace} />

      {confirmingChallenge && newest && (
        <ConfirmChallengeSheet
          onConfirm={() => {
            setConfirmingChallenge(false)
            m.challengeBot()
          }}
          onCancel={() => setConfirmingChallenge(false)}
        />
      )}
      {defending && newest && (
        <DefendInterstitial
          word={newest.word}
          oppName={botName}
          resolving={m.resolving}
          offline={m.event?.kind === 'referee-offline'}
          onStand={() => void m.defend('stand')}
          onFold={() => void m.defend('fold')}
          onCoinFlip={m.coinFlip}
        />
      )}
      {accusing && newest && (
        <AccusePending
          word={newest.word}
          waitingCopy={`${botName} is deciding whether to fold…`}
          offline={false}
          onCoinFlip={() => undefined}
        />
      )}
      {(m.event?.kind === 'verdict' || m.event?.kind === 'bot-folded') && (
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
  event: Extract<SoloEvent, { kind: 'verdict' | 'bot-folded' }>
  botName: string
  onDismiss: () => void
}) {
  if (event.kind === 'bot-folded') {
    return (
      <VerdictStamp
        stamp="FOLDED"
        good
        copy={`${botName} folds! ${event.word.toUpperCase()} is struck from the chain and ${botName} loses a life.`}
        onDismiss={onDismiss}
      />
    )
  }
  const flip = event.coinFlip ? ' The coin decided.' : ''
  if (event.defender === 'p1') {
    return event.real ? (
      <VerdictStamp
        stamp="REAL"
        good
        copy={`${event.word.toUpperCase()} stands.${flip} ${botName} loses a life for doubting you.`}
        onDismiss={onDismiss}
      />
    ) : (
      <VerdictStamp
        stamp="FAKE"
        good={false}
        copy={`Busted.${flip} ${event.word.toUpperCase()} is struck from the chain and you lose a life.`}
        onDismiss={onDismiss}
      />
    )
  }
  return (
    <VerdictStamp
      stamp="REAL"
      good={false}
      copy={`${botName} stands, and the ruling is in: ${event.word.toUpperCase()} is real — you lose a life.`}
      onDismiss={onDismiss}
    />
  )
}
