// Lloyd's tutorial match: the real solo match screen with a scripted Lloyd
// and coach bubbles pinned to the board (mockups/tutorial-flow.html). All
// game physics are the shipped ones — the tutorial only paces them.

import { useEffect, useState } from 'react'
import { ChainLedger } from '../components/ChainLedger'
import { Deck, PassButton } from '../components/Deck'
import { Hud } from '../components/Hud'
import { Toast } from '../components/Toast'
import { useComposer } from '../components/useComposer'
import { useDeckKeyboard } from '../components/useDeckKeyboard'
import { ConfirmChallengeSheet, GameOverPanel } from '../components/overlays'
import { LastCallBar } from '../components/LastCallBar'
import { gripOptions, lastCallActorOf } from '../game'
import { api } from '../lib/api'
import { SENDOFF_LOSS, SENDOFF_WIN, SUGGESTED_WORD, WHISPER, type BubbleCopy } from '../solo/tutorial'
import { useTutorial } from '../solo/useTutorial'
import { SoloVerdict } from './SoloMatch'

interface TutorialMatchProps {
  onExit: () => void
  onDuel: () => void
  onRematchLloyd: () => void
  /** Set when the player reached the tutorial from an invite: the ending sends
   *  them back into that match instead of offering a fresh duel. */
  resumeInvite?: string | null
  onResumeInvite?: (code: string) => void
}

/** `**bold**` spans in Lloyd's lines render emphasized. */
function BubbleText({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) =>
        i % 2 === 1 ? (
          <b key={i} className="font-extrabold">
            {part}
          </b>
        ) : (
          part
        ),
      )}
    </>
  )
}

/** Lloyd's coach bubble, with his LL-tile avatar. Each beat's cards deal in
 *  one after another (`delay` staggers them) so a copy change is visible
 *  even when the player's eyes are on the board. */
function Bubble({ copy, tapnext, delay }: { copy: BubbleCopy; tapnext: boolean; delay: number }) {
  return (
    <div
      className="bubble-in bg-white rounded-2xl px-3.5 py-3 shadow-[0_4px_0_#E2DDD3]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="flex gap-[2px]">
          <span className="w-[15px] h-[15px] rounded bg-p2 text-white text-[10px] font-extrabold flex items-center justify-center shadow-[0_2px_0_var(--color-p2-lip)]">
            L
          </span>
          <span className="w-[15px] h-[15px] rounded bg-p2 text-white text-[10px] font-extrabold flex items-center justify-center shadow-[0_2px_0_var(--color-p2-lip)]">
            L
          </span>
        </span>
        <span className="text-[9px] font-extrabold tracking-[1.6px] text-p2-lip uppercase">
          {copy.eyebrow === 'lesson' ? 'The lesson' : 'Lloyd'}
        </span>
      </div>
      <p className="text-[13.5px] leading-snug font-semibold text-ink-strong">
        <BubbleText text={copy.text} />
      </p>
      {tapnext && (
        <p className="text-right text-[9.5px] font-extrabold tracking-wider uppercase text-dim mt-1.5">
          tap to keep going ▸
        </p>
      )}
    </div>
  )
}

export function TutorialMatch({
  onExit,
  onDuel,
  onRematchLloyd,
  resumeInvite,
  onResumeInvite,
}: TutorialMatchProps) {
  const t = useTutorial()
  const [confirmingChallenge, setConfirmingChallenge] = useState(false)
  // When we came from an invite, name the inviter on the ending's coral CTA.
  const [inviterName, setInviterName] = useState<string | null>(null)
  useEffect(() => {
    if (!resumeInvite) return
    let alive = true
    void api.preview(resumeInvite).then((r) => {
      if (alive && r.ok) setInviterName(r.creatorName)
    })
    return () => {
      alive = false
    }
  }, [resumeInvite])

  const { state, beat } = t
  const newest = state.chain[state.chain.length - 1]
  const composerActive = t.playerTurn && t.passive
  const composer = useComposer(newest?.word ?? null, composerActive)

  const playTyped = () => {
    if (t.playWord(composer.typed)) composer.clear()
  }
  // Desktop: physical keys work in the tutorial too — same composer,
  // same guardrails (the composer refuses off-grip letters either way).
  useDeckKeyboard(composerActive && !confirmingChallenge, {
    onKey: composer.key,
    onBackspace: composer.backspace,
    onPlay: () => {
      if (composer.canPlay) playTyped()
    },
  })
  const fan =
    t.playerTurn && t.passive && !composer.typed && newest ? gripOptions(newest.word) : null
  const canChallenge =
    (t.playerTurn || t.playerLastCall) &&
    (beat === 'smell' || beat === 'bluff' || beat === 'done') &&
    newest !== undefined &&
    newest.owner === 'p2' &&
    !newest.challengeSurvived &&
    !composer.typed

  // The guided first word: ghost finish + glowing next key, only while the
  // draft is still on the suggested path.
  const onPath = beat === 'firstWord' && SUGGESTED_WORD.startsWith(composer.typed)
  const hintTail =
    onPath && composer.typed ? SUGGESTED_WORD.slice(composer.typed.length) : undefined
  const glowKey =
    onPath && composer.typed.length < SUGGESTED_WORD.length
      ? SUGGESTED_WORD[composer.typed.length]
      : undefined

  const active = t.terminal
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
      {/* Above the tap-to-continue gate (z-[5]) so ← Home always works,
          below the sheets/stamps/game-over overlays (z-10). */}
      <div className="flex items-center justify-between px-3.5 pt-2 pb-2.5 relative z-[6]">
        <button onClick={onExit} className="h-11 px-2 font-extrabold text-[13px] text-dim">
          ← Home
        </button>
        <PassButton disabled={!t.playerTurn || beat !== 'done'} onPass={t.pass} />
      </div>
      <Hud state={state} you="p1" active={active} pulse={t.botThinking} />
      <div className="flex-1 relative flex flex-col min-h-0">
        <ChainLedger
          chain={state.chain}
          you="p1"
          players={state.players}
          canChallenge={canChallenge}
          onChallenge={() => setConfirmingChallenge(true)}
          composer={composer.typed ? { ...composer, hintTail } : null}
          fan={fan}
          onSeed={composer.seed}
          onPlay={playTyped}
        />
        {t.bubbles.length > 0 && (
          <div className="absolute top-2 left-3.5 right-3.5 flex flex-col gap-2.5 z-[6] pointer-events-none">
            {t.bubbles.map((b, i) => (
              <Bubble
                key={`${beat}-${i}`}
                copy={b}
                tapnext={t.gated && i === t.bubbles.length - 1}
                delay={i * 160}
              />
            ))}
          </div>
        )}
      </div>
      {/* Gated beats: a tap anywhere below the top bar advances the lesson. */}
      {t.gated && (
        <button
          type="button"
          aria-label="Continue"
          onClick={t.advance}
          className="fixed inset-0 z-[5]"
        />
      )}
      <Toast
        message={t.event?.kind === 'bot-passed' ? 'Lloyd is stuck and passes — a life slips away.' : null}
      />
      {t.error && (
        <div className="mx-3.5 mb-2 text-center text-[13px] font-bold text-p2-lip bg-white rounded-xl py-2 shadow-[0_3px_0_#E2DDD3]">
          {t.error}
        </div>
      )}
      {/* The guided first word (ANTIC) is the one exception — its scripted
          glow owns the deck. Every other turn shows the real game's key
          hints, so nothing about the deck changes when the tutorial ends. */}
      {t.playerLastCall && newest ? (
        <LastCallBar finisherName="Lloyd" word={newest.word} onShake={t.shake} />
      ) : (
        <Deck
          disabled={!composerActive}
          glowKey={glowKey}
          keyHints={beat === 'firstWord' ? null : composer.keyHints}
          onKey={composer.key}
          onBackspace={composer.backspace}
        />
      )}

      {confirmingChallenge && newest && (
        <ConfirmChallengeSheet
          word={newest.word}
          whisper={beat === 'smell' ? WHISPER : undefined}
          onConfirm={() => {
            setConfirmingChallenge(false)
            t.challenge()
          }}
          onCancel={() => {
            setConfirmingChallenge(false)
            if (beat === 'smell') t.neverMind()
          }}
        />
      )}
      {t.event?.kind === 'verdict' && (
        <SoloVerdict event={t.event} botName="Lloyd" onDismiss={t.clearEvent} />
      )}
      {t.terminal && (
        <GameOverPanel
          state={state}
          you="p1"
          rematchLabel="Rematch (Lloyd opens)"
          sendoff={state.winner === 'p1' ? SENDOFF_WIN : SENDOFF_LOSS}
          primary={
            resumeInvite && onResumeInvite
              ? {
                  label: `Play your turn against ${inviterName ?? 'your friend'}`,
                  onClick: () => onResumeInvite(resumeInvite),
                }
              : { label: 'Challenge a friend', onClick: onDuel }
          }
          onRematch={onRematchLloyd}
          onExit={onExit}
        />
      )}
    </div>
  )
}
