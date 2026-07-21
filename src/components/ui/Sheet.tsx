// The one bottom-sheet scaffold: dimmed backdrop (tap to close), white card
// rising from the bottom edge, safe-area bottom padding. Every sheet in the
// app rides this. `z` picks the stack when sheets layer over other overlays:
// match overlays sit at z-10, the ledger's word detail above them at 20, the
// name card above an invite landing at 30.

import type { ReactNode } from 'react'

const Z = { 10: 'z-10', 20: 'z-20', 30: 'z-30' } as const

interface SheetProps {
  onClose: () => void
  z?: keyof typeof Z
  /** 'light' keeps the board readable behind a quick peek (ledger detail). */
  scrim?: 'default' | 'light'
  /** The little drag-handle bar at the top of the card. */
  grabber?: boolean
  /** Layout inside the card, replacing the default 'gap-4'. */
  cardClass?: string
  children: ReactNode
}

export function Sheet({
  onClose,
  z = 10,
  scrim = 'default',
  grabber = false,
  cardClass = 'gap-4',
  children,
}: SheetProps) {
  return (
    <div
      className={`fixed inset-0 max-w-[430px] mx-auto ${
        scrim === 'light' ? 'bg-ink-strong/30' : 'bg-ink-strong/40'
      } flex items-end ${Z[z]}`}
      onClick={onClose}
    >
      <div
        className={`bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1rem))] flex flex-col ${cardClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {grabber && <div className="w-11 h-1.5 rounded-full bg-board-lo -mt-2 self-center" aria-hidden />}
        {children}
      </div>
    </div>
  )
}
