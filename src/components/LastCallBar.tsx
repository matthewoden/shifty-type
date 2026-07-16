// The accepter's side of last call: the chain is full, the other player laid
// the final word, and the match ends the moment you shake on it. Challenging
// stays where it always lives — tapping the word's flag on the ledger — so
// this bar only has to sell the handshake and point at the alternative.

import { HandshakeIcon } from './icons'

interface LastCallBarProps {
  /** Whoever played the final word. */
  finisherName: string
  /** The final word, as played. */
  word: string
  busy?: boolean
  onShake: () => void
}

export function LastCallBar({ finisherName, word, busy = false, onShake }: LastCallBarProps) {
  return (
    <div className="px-5 pb-10 pt-2 text-center">
      <p className="font-extrabold text-[15px] text-ink-strong">
        Last call — {finisherName} played the final word.
      </p>
      <p className="font-semibold text-xs text-dim mt-1">
        Shake on it to end the match, or tap {word.toUpperCase()} to challenge it.
      </p>
      <button
        onClick={onShake}
        disabled={busy}
        className="mt-3 h-12 px-6 rounded-full bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5 inline-flex items-center gap-2 font-extrabold text-[14px] disabled:opacity-60"
      >
        <HandshakeIcon className="w-5 h-5 text-white" /> Shake on it
      </button>
    </div>
  )
}
