import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { getSavedName, saveMatchAuth, saveName } from '../multi/storage'

interface DuelCreateProps {
  onEnterMatch: (code: string) => void
  onBack: () => void
}

/**
 * Start a duel. A returning player (name already saved) skips straight to a
 * fresh match and their opening word — no form. A first-timer gets a single
 * name field. Either way the match is created in the opener's turn, so the
 * next screen is the board, not a lobby.
 */
export function DuelCreate({ onEnterMatch, onBack }: DuelCreateProps) {
  const saved = getSavedName()
  const [name, setName] = useState(saved)
  const [pending, setPending] = useState(!!saved)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  async function create(displayName: string) {
    setPending(true)
    setError(null)
    saveName(displayName)
    const r = await api.create(displayName)
    if (!r.ok) {
      setPending(false)
      return setError(r.error)
    }
    saveMatchAuth(r.code, { token: r.token, you: 'p1' })
    onEnterMatch(r.code)
  }

  // Known player: set the match up immediately, no name step.
  useEffect(() => {
    if (saved && !started.current) {
      started.current = true
      void create(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (saved && pending && !error) {
    return (
      <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-ink-strong font-extrabold text-lg animate-pulse motion-reduce:animate-none">
          Setting up your match…
        </p>
        <button onClick={onBack} className="h-11 px-4 font-extrabold text-dim">
          ← Back
        </button>
      </div>
    )
  }

  function submit() {
    const displayName = name.trim()
    if (!displayName) return setError("Pick a name first, so your friend knows who they're playing.")
    void create(displayName)
  }

  return (
    <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-5 p-6">
      <h2 className="text-2xl font-extrabold text-ink-strong">Challenge a friend</h2>
      <div className="flex flex-col gap-3.5 w-full max-w-xs">
        <label className="text-[13px] font-bold text-ink">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={20}
            placeholder="e.g. Matt"
            autoFocus
            className="mt-1 w-full h-12 bg-white rounded-xl px-3.5 font-extrabold text-lg text-ink-strong shadow-[0_4px_0_#E2DDD3] outline-none placeholder:text-dim placeholder:font-bold"
          />
        </label>
        <button
          onClick={submit}
          disabled={pending}
          className="h-14 rounded-2xl font-extrabold text-lg bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5 disabled:opacity-50"
        >
          Start the match
        </button>
        <p className="text-center text-[12.5px] font-semibold text-dim">
          You'll play your opening word, then send your friend an invite.
        </p>
        {error && <p className="text-[13px] font-bold text-p2-lip text-center">{error}</p>}
      </div>
      <button onClick={onBack} className="h-11 px-4 font-extrabold text-dim">
        ← Back
      </button>
    </div>
  )
}
