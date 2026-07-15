import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { PreviewResponse } from '../lib/protocol'
import { getSavedName, saveMatchAuth, saveName } from '../multi/storage'
import { WordTiles } from '../components/WordTiles'

interface InviteLandingProps {
  code: string
  onEnterMatch: (code: string) => void
  onHowTo: () => void
  onTutorial: () => void
  onBack: () => void
}

/** A quiet wordmark — the logo's move without the animation. */
function Wordmark() {
  return (
    <div className="flex flex-col items-start gap-1.5" aria-label="Shifty Type">
      <WordTiles word="shifty" side="you" tailTint={2} small />
      <span className="ml-[68px]">
        <WordTiles word="type" side="them" headTint={2} small />
      </span>
    </div>
  )
}

/**
 * What a friend lands on when they tap an invite link on a device that isn't
 * yet in the match. Names the inviter, shows the word already on the table,
 * and offers three ways in — including a tutorial that hands back here.
 */
export function InviteLanding({ code, onEnterMatch, onHowTo, onTutorial, onBack }: InviteLandingProps) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [name, setName] = useState(getSavedName())
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

  async function getStarted() {
    const displayName = name.trim()
    if (!displayName) {
      setAskName(true)
      return
    }
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
      <Wordmark />

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-extrabold text-ink-strong text-balance max-w-[17rem]">
          <span className="text-p2-lip">{inviter}</span> invited you to Shifty&nbsp;Type
        </h1>
        <p className="text-[13.5px] font-semibold text-ink max-w-[16rem]">
          An async word duel — you and a friend trade words that overlap.{' '}
          {preview.openingWord ? `${inviter} already opened. You're up.` : `${inviter} is waiting for you.`}
        </p>
      </div>

      {preview.openingWord && (
        <div className="bg-white rounded-2xl px-4 py-3 flex flex-col items-center gap-2 shadow-[0_3px_0_#E2DDD3]">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-p2-lip">
            {inviter} opened with
          </span>
          <WordTiles word={preview.openingWord} side="them" />
        </div>
      )}

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {askName && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void getStarted()}
            maxLength={20}
            placeholder="Your name"
            autoFocus
            className="h-12 bg-white rounded-xl px-3.5 font-extrabold text-lg text-center text-ink-strong shadow-[0_4px_0_#E2DDD3] outline-none placeholder:text-dim placeholder:font-bold"
          />
        )}
        <button
          onClick={() => void getStarted()}
          disabled={pending}
          className="h-14 rounded-2xl font-extrabold text-lg bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5 disabled:opacity-50"
        >
          Get started
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
    </div>
  )
}
