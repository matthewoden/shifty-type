import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { PreviewResponse } from '../lib/protocol'
import { getSavedName, saveMatchAuth, saveName } from '../multi/storage'
import { TileRail } from '../components/WordTiles'
import { Logo } from '../components/Logo'
import { NameSheet } from '../components/NameSheet'

interface InviteLandingProps {
  code: string
  onEnterMatch: (code: string) => void
  onHowTo: () => void
  onTutorial: () => void
  onBack: () => void
}

/**
 * What a friend lands on when they tap an invite link on a device that isn't
 * yet in the match. Names the inviter, shows the word already on the table,
 * and offers three ways in — including a tutorial that hands back here.
 */
export function InviteLanding({ code, onEnterMatch, onHowTo, onTutorial, onBack }: InviteLandingProps) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [askName, setAskName] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void api.preview(code).then((r) => {
      if (alive) setPreview(r)
    })
    return () => {
      alive = false
    }
  }, [code])

  // Tapping Get started with no saved name opens the name card; the card's
  // submit routes back here with the name in hand.
  function getStarted() {
    const saved = getSavedName().trim()
    if (!saved) {
      setAskName(true)
      return
    }
    void join(saved)
  }

  async function join(displayName: string) {
    setAskName(false)
    setPending(true)
    setError(null)
    saveName(displayName)
    const r = await api.join(code, displayName)
    setPending(false)
    if (!r.ok) return setError(r.error)
    saveMatchAuth(code, { token: r.token, you: 'p2' })
    onEnterMatch(code)
  }

  if (!preview) {
    return (
      <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-ink-strong font-extrabold text-lg animate-pulse motion-reduce:animate-none">
          Opening your invite…
        </p>
      </div>
    )
  }

  if (!preview.ok || !preview.joinable) {
    const message = !preview.ok
      ? "This invite link doesn't lead anywhere — it may have expired."
      : 'This match already has two players.'
    return (
      <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-5 p-8 text-center">
        <h2 className="text-xl font-extrabold text-ink-strong text-balance">{message}</h2>
        <button
          onClick={onBack}
          className="h-13 px-6 rounded-2xl font-extrabold bg-ink-strong text-white shadow-[0_4px_0_#262E38] active:translate-y-0.5"
        >
          Go to Shifty Type
        </button>
      </div>
    )
  }

  const inviter = preview.creatorName

  return (
    <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-6 p-6 text-center">
      {/* The headline holds while the logo plays its own move; the blurb,
          opening word, and buttons fade up in sequence once it lands. */}
      <div className="flex flex-col items-center gap-3">
        <p className="invite-in text-[15px] font-bold text-ink text-balance max-w-[15rem]">
          <span className="text-p2-lip font-extrabold">{inviter}</span> invited you to
        </p>
        <Logo />
      </div>

      <p
        className="invite-in text-[13.5px] font-semibold text-ink max-w-[16rem]"
        style={{ animationDelay: '1500ms' }}
      >
        A word game at your own pace — you and a friend trade words that overlap.{' '}
        {preview.openingWord ? `${inviter} already opened. You're up.` : `${inviter} is waiting for you.`}
      </p>

      {preview.openingWord && (
        <div
          className="invite-in bg-white rounded-2xl py-3 w-full max-w-xs flex flex-col items-center gap-2 shadow-[0_3px_0_#E2DDD3]"
          style={{ animationDelay: '1650ms' }}
        >
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-p2-lip">
            {inviter} opened with
          </span>
          {/* Same rail as the opener's share card, in the friend's coral. */}
          <TileRail word={preview.openingWord} side="them" align="center" peek className="w-full" />
        </div>
      )}

      <div className="invite-in flex flex-col gap-3 w-full max-w-xs" style={{ animationDelay: '1800ms' }}>
        <button
          onClick={getStarted}
          disabled={pending}
          className="h-14 rounded-2xl font-extrabold text-lg bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5 disabled:opacity-50"
        >
          {pending ? 'Joining the game…' : 'Get started'}
        </button>
        <button
          onClick={onHowTo}
          className="h-12 rounded-2xl font-extrabold bg-white text-ink shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5"
        >
          How to play
        </button>
        <button
          onClick={onTutorial}
          className="h-12 rounded-2xl font-extrabold bg-white text-ink shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5"
        >
          Try the 2-minute tutorial
        </button>
        {error && <p className="text-[13px] font-bold text-p2-lip text-center">{error}</p>}
        <p className="text-center text-[12px] font-semibold text-dim max-w-[15rem] mx-auto">
          Do the tutorial first and we'll bring you right back to {inviter}'s match.
        </p>
      </div>

      {askName && (
        <NameSheet
          title="One thing first — your name?"
          subtitle={`So ${inviter} knows who they're playing.`}
          cta="Let's go"
          accent="p2"
          pending={pending}
          onSubmit={(n) => void join(n)}
          onClose={() => setAskName(false)}
        />
      )}
    </div>
  )
}
