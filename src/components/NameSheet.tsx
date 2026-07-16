// A bottom-sheet card for entering a display name. Opened when a flow needs a
// name it doesn't have yet (the invite "Get started"), so the tap that asks and
// the tap that continues are one gesture — no field appearing above a button
// you then have to reach back to. Confirm is disabled until something's typed.

import { useState } from 'react'

interface NameSheetProps {
  title: string
  subtitle?: string
  cta: string
  initial?: string
  pending?: boolean
  /** 'p2' coral for the invite flow, 'p1' indigo elsewhere. */
  accent?: 'p1' | 'p2'
  onSubmit: (name: string) => void
  onClose: () => void
}

export function NameSheet({
  title,
  subtitle,
  cta,
  initial = '',
  pending = false,
  accent = 'p2',
  onSubmit,
  onClose,
}: NameSheetProps) {
  const [name, setName] = useState(initial)
  const trimmed = name.trim()
  const submit = () => {
    if (trimmed) onSubmit(trimmed)
  }
  const ring = accent === 'p2' ? 'focus-within:ring-p2' : 'focus-within:ring-p1'
  const btn =
    accent === 'p2'
      ? 'bg-p2 shadow-[0_4px_0_var(--color-p2-lip)]'
      : 'bg-p1 shadow-[0_4px_0_var(--color-p1-lip)]'

  return (
    <div className="fixed inset-0 bg-ink-strong/40 flex items-end z-30" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))] flex flex-col gap-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-extrabold text-lg text-ink-strong">{title}</h2>
        {subtitle && <p className="text-[13px] font-semibold text-dim -mt-2">{subtitle}</p>}
        <div className={`rounded-xl ${ring} focus-within:ring-2`}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={20}
            placeholder="Your name"
            autoFocus
            className="w-full h-13 bg-board rounded-xl px-4 font-extrabold text-lg text-ink-strong outline-none placeholder:text-dim placeholder:font-bold text-center"
          />
        </div>
        <button
          onClick={submit}
          disabled={pending || !trimmed}
          className={`h-14 rounded-2xl font-extrabold text-lg text-white active:translate-y-0.5 disabled:opacity-40 disabled:active:translate-y-0 ${btn}`}
        >
          {pending ? 'One sec…' : cta}
        </button>
      </div>
    </div>
  )
}
