import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { PreviewResponse } from '../lib/protocol'
import { getSavedName, saveMatchAuth, saveName } from '../multi/storage'
import { TileRail } from '../components/WordTiles'
import { Logo } from '../components/Logo'
import { NameSheet } from '../components/NameSheet'
import { Button } from '../components/ui/Button'

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
        <h2 className="text-headline font-extrabold text-ink-strong text-balance">{message}</h2>
        <Button variant="cta" accent="ink" onClick={onBack} className="px-6">
          Go to Shifty Type
        </Button>
      </div>
    )
  }

  const inviter = preview.creatorName

  return (
    <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-6 p-6 text-center">
      {/* The headline holds while the logo plays its own move; the blurb,
          opening word, and buttons fade up in sequence once it lands. */}
      <div className="flex flex-col items-center gap-3">
        <p className="invite-in text-status font-bold text-ink text-balance max-w-[15rem]">
          <span className="text-p2-lip font-extrabold">{inviter}</span> invited you to
        </p>
        <Logo />
      </div>

      <p
        className="invite-in text-body font-semibold text-ink max-w-[16rem]"
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
          <span className="text-label font-extrabold uppercase tracking-wider text-p2-lip">
            {inviter} opened with
          </span>
          {/* Same rail as the opener's share card, in the friend's coral. */}
          <TileRail word={preview.openingWord} side="them" align="center" peek className="w-full" />
        </div>
      )}

      <div className="invite-in flex flex-col gap-3 w-full max-w-xs" style={{ animationDelay: '1800ms' }}>
        <Button variant="cta" accent="p2" size="lg" onClick={getStarted} disabled={pending}>
          {pending ? 'Joining the game…' : 'Get started'}
        </Button>
        <Button variant="cta" accent="white" size="sm" onClick={onHowTo}>
          How to play
        </Button>
        <Button variant="cta" accent="white" size="sm" onClick={onTutorial}>
          Try the 2-minute tutorial
        </Button>
        {error && <p className="text-body font-bold text-p2-lip text-center">{error}</p>}
        <p className="text-center text-caption font-semibold text-dim max-w-[15rem] mx-auto">
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
