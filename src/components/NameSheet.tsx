// A bottom-sheet card for entering a display name. Opened when a flow needs a
// name it doesn't have yet (the invite "Get started"), so the tap that asks and
// the tap that continues are one gesture — no field appearing above a button
// you then have to reach back to. Confirm is disabled until something's typed.

import { useState } from 'react'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'

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

  return (
    <Sheet onClose={onClose} z={30} cardClass="gap-3.5">
      <h2 className="font-extrabold text-lg text-ink-strong">{title}</h2>
      {subtitle && <p className="text-body font-semibold text-dim -mt-2">{subtitle}</p>}
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
      <Button variant="cta" accent={accent} size="lg" onClick={submit} disabled={pending || !trimmed}>
        {pending ? 'One sec…' : cta}
      </Button>
    </Sheet>
  )
}
