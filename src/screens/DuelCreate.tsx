import { useEffect, useRef, useState } from 'react'
import { saveName } from '../multi/storage'
import { Button } from '../components/ui/Button'

interface DuelCreateProps {
  onStart: () => void
  onBack: () => void
}

/**
 * The name gate before a first duel. Nothing is created here — the board
 * opens locally and the match only exists once the opening word is played
 * (see MultiMatch's draft mode). Returning players (name already saved) skip
 * this screen entirely; App routes them straight to the draft board.
 */
export function DuelCreate({ onStart, onBack }: DuelCreateProps) {
  const [name, setName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  // Not autoFocus: focusing mid-slide lets the browser yank the focused input
  // into view, which scrolls the nav stage and snaps the screen into place.
  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true })
  }, [])
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const displayName = name.trim()
    if (!displayName) return setError("Pick a name first, so your friend knows who they're playing.")
    saveName(displayName)
    onStart()
  }

  return (
    <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-5 p-6">
      <h2 className="text-title font-extrabold text-ink-strong">Challenge a friend</h2>
      <div className="flex flex-col gap-3.5 w-full max-w-xs">
        <label className="text-body font-bold text-ink">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={20}
            placeholder="e.g. Matt"
            ref={nameRef}
            className="mt-1 w-full h-12 bg-white rounded-xl px-3.5 font-extrabold text-lg text-ink-strong shadow-[0_4px_0_#E2DDD3] outline-none placeholder:text-dim placeholder:font-bold"
          />
        </label>
        <Button variant="cta" accent="p2" size="lg" onClick={submit}>
          Start the match
        </Button>
        <p className="text-center text-caption font-semibold text-dim">
          You'll play your opening word, then send your friend an invite.
        </p>
        {error && <p className="text-body font-bold text-p2-lip text-center">{error}</p>}
      </div>
      <Button variant="text" onClick={onBack}>
        ← Back
      </Button>
    </div>
  )
}
