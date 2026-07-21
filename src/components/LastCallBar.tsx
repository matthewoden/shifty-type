// The accepter's side of last call: the chain is full, the other player laid
// the final word, and the match ends the moment you shake on it. Challenging
// stays where it always lives — tapping the word's flag on the ledger — so
// this bar only has to sell the handshake and point at the alternative.

import { HandshakeIcon } from './icons'
import { Button } from './ui/Button'

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
      <p className="font-extrabold text-status text-ink-strong">
        Last call — {finisherName} played the final word.
      </p>
      <p className="font-semibold text-caption text-dim mt-1 break-words">
        Shake on it to end the match, or tap {word.toUpperCase()} to challenge it.
      </p>
      <Button variant="pill" accent="p2" size="lg" onClick={onShake} disabled={busy} className="mt-3">
        <HandshakeIcon className="w-5 h-5 text-white" /> Shake on it
      </Button>
    </div>
  )
}
