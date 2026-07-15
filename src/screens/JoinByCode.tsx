import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { getSavedName, saveMatchAuth, saveName } from '../multi/storage'

interface JoinByCodeProps {
  onEnterMatch: (code: string) => void
  onBack: () => void
}

/** Four big cells fed by a single hidden input — one keyboard, no per-cell
 *  focus juggling, works cleanly on a phone. */
function CodeCells({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const cells = value.padEnd(4, ' ').slice(0, 4).split('')
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
        maxLength={4}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        aria-label="Their match code"
        className="absolute inset-0 w-full h-full opacity-0"
      />
      <div className="flex gap-2.5 justify-center" aria-hidden>
        {cells.map((c, i) => {
          const filled = c.trim() !== ''
          const caret = i === Math.min(value.length, 3)
          return (
            <span
              key={i}
              className={`w-[52px] h-[62px] rounded-2xl bg-white flex items-center justify-center text-3xl font-extrabold text-ink-strong ${
                caret
                  ? 'shadow-[0_0_0_3px_var(--color-p2),0_4px_0_var(--color-p2-lip)]'
                  : filled
                    ? 'shadow-[0_4px_0_var(--color-p2-tint-lip)]'
                    : 'shadow-[0_4px_0_#E2DDD3]'
              }`}
            >
              {filled ? c : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Its own screen: join a friend's match when you've been given a 4-letter
 *  code (an invite link never needs it). */
export function JoinByCode({ onEnterMatch, onBack }: JoinByCodeProps) {
  const [name, setName] = useState(getSavedName())
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join() {
    const c = code.trim().toUpperCase()
    const displayName = name.trim()
    if (!displayName) return setError("Pick a name first, so your friend knows who they're playing.")
    if (c.length !== 4) return setError('Match codes are 4 characters.')
    setPending(true)
    setError(null)
    saveName(displayName)
    const r = await api.join(c, displayName)
    setPending(false)
    if (!r.ok) return setError(r.error)
    saveMatchAuth(c, { token: r.token, you: 'p2' })
    onEnterMatch(c)
  }

  return (
    <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-ink-strong">Join a friend's match</h2>
        <p className="mt-1.5 text-[13.5px] font-semibold text-ink max-w-[15rem] mx-auto">
          Got a 4-letter code from a friend? Pop it in.
        </p>
      </div>

      <div className="flex flex-col gap-5 w-full max-w-xs items-stretch">
        <label className="text-[13px] font-bold text-ink">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="e.g. Sam"
            className="mt-1 w-full h-12 bg-white rounded-xl px-3.5 font-extrabold text-lg text-ink-strong shadow-[0_4px_0_#E2DDD3] outline-none placeholder:text-dim placeholder:font-bold"
          />
        </label>

        <div>
          <span className="text-[13px] font-bold text-ink">Their code</span>
          <div className="mt-2">
            <CodeCells value={code} onChange={setCode} />
          </div>
        </div>

        <button
          onClick={join}
          disabled={pending}
          className="h-14 rounded-2xl font-extrabold text-lg bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5 disabled:opacity-50"
        >
          Join the match
        </button>
        {error && <p className="text-[13px] font-bold text-p2-lip text-center">{error}</p>}
        {pending && (
          <p className="text-[13px] font-bold text-dim text-center animate-pulse">Joining…</p>
        )}
        <p className="text-center text-[12.5px] font-semibold text-dim">
          Sent a <b className="text-ink">link</b> instead? Just tap it — no code needed.
        </p>
      </div>

      <button onClick={onBack} className="h-11 px-4 font-extrabold text-dim">
        ← Back
      </button>
    </div>
  )
}
