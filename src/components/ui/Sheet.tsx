// The one bottom-sheet scaffold: dimmed backdrop (tap to close), white card
// rising from the bottom edge, safe-area bottom padding. Every sheet in the
// app rides this. `z` picks the stack when sheets layer over other overlays:
// match overlays sit at z-10, the ledger's word detail above them at 20, the
// name card above an invite landing at 30.
//
// Motion: the card slides up on open and down on close — every close path
// (backdrop tap, handle tap, drag past the threshold, an inner "Not now")
// plays the slide before onClose unmounts the sheet. Inner dismiss buttons
// get the animated close by using the function-children form:
//   <Sheet onClose={...}>{(close) => <Button onClick={close}>Done</Button>}</Sheet>
// The handle is always there: drag it down far enough to let the sheet go,
// tap it to close, a short drag springs back.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

const Z = { 10: 'z-10', 20: 'z-20', 30: 'z-30' } as const

interface SheetProps {
  onClose: () => void
  z?: keyof typeof Z
  /** 'light' keeps the board readable behind a quick peek (ledger detail). */
  scrim?: 'default' | 'light'
  /** Layout inside the card, replacing the default 'gap-4'. */
  cardClass?: string
  children: ReactNode | ((close: () => void) => ReactNode)
}

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Sheet({
  onClose,
  z = 10,
  scrim = 'default',
  cardClass = 'gap-4',
  children,
}: SheetProps) {
  // false on the mount frame (card parked below the edge), true a frame
  // later — the flip is what plays the slide-up.
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ y: number; dy: number; moved: boolean } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setOpen(true)),
    )
    return () => cancelAnimationFrame(raf)
  }, [])

  const close = () => {
    if (closing) return
    if (reducedMotion()) return onClose()
    setClosing(true)
  }

  // If the transform's transitionend never lands (hidden tab), close anyway.
  useEffect(() => {
    if (!closing) return
    const t = window.setTimeout(onClose, 400)
    return () => clearTimeout(t)
  }, [closing, onClose])

  const down = (e: ReactPointerEvent) => {
    if (closing) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { y: e.clientY, dy: 0, moved: false }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y
    if (Math.abs(dy) > 4) d.moved = true
    // Downward follows the finger; upward resists like a rubber band.
    d.dy = dy > 0 ? dy : Math.max(dy / 8, -12)
    setDragY(d.dy)
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (!d) return
    if (!d.moved) return close() // a tap on the handle closes
    const h = cardRef.current?.offsetHeight ?? 300
    if (d.dy > Math.min(h * 0.35, 140)) return close()
    setDragY(0)
  }
  const cancel = () => {
    drag.current = null
    setDragging(false)
    setDragY(0)
  }

  const transform = closing
    ? 'translateY(110%)'
    : !open
      ? 'translateY(100%)'
      : `translateY(${dragY}px)`

  return (
    <div
      className={`fixed inset-0 max-w-[430px] mx-auto flex items-end ${Z[z]}`}
      onClick={close}
    >
      <div
        className={`absolute inset-0 ${
          scrim === 'light' ? 'bg-ink-strong/30' : 'bg-ink-strong/40'
        } transition-opacity duration-300 motion-reduce:transition-none ${
          open && !closing ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden
      />
      <div
        ref={cardRef}
        className={`relative bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1rem))] flex flex-col ${cardClass} ${
          dragging
            ? ''
            : 'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
        }`}
        style={{ transform }}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={(e) => {
          if (closing && e.target === e.currentTarget && e.propertyName === 'transform')
            onClose()
        }}
      >
        <div
          role="button"
          aria-label="Close"
          className="self-stretch flex items-center justify-center min-h-11 -mt-6 -mb-3 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
        >
          <div className="w-11 h-1.5 rounded-full bg-board-lo" aria-hidden />
        </div>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>
  )
}
