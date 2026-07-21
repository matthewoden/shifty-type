// Physical-keyboard support for the deck: desktop players type instead of
// clicking chiclets. Letters feed the composer (which already refuses dead
// keys), Backspace erases, Enter plays. The listener goes inert whenever the
// deck is (not your turn, a sheet is up, a move in flight), stays out of real
// text inputs, and leaves modifier shortcuts (cmd/ctrl/alt) alone.

import { useEffect, useRef } from 'react'

interface DeckKeys {
  onKey: (letter: string) => void
  onBackspace: () => void
  onPlay: () => void
}

/** Tell the on-screen deck a physical key landed, so the matching chiclet
 *  can dip like a tap. An event, not a prop — the hook lives in the screen,
 *  the deck two components away, and nothing in between needs to know. */
function announce(key: string): void {
  window.dispatchEvent(new CustomEvent('deckpress', { detail: key }))
}

export function useDeckKeyboard(enabled: boolean, keys: DeckKeys): void {
  // The handlers close over fresh state each render; the listener reads the
  // latest through a ref so it never rebinds on every keystroke.
  const ref = useRef(keys)
  ref.current = keys

  useEffect(() => {
    if (!enabled) return
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (/^[a-zA-Z]$/.test(e.key)) {
        ref.current.onKey(e.key)
        announce(e.key.toLowerCase())
      } else if (e.key === 'Backspace') {
        e.preventDefault() // some browsers still treat bare Backspace as Back
        ref.current.onBackspace()
        announce('backspace')
      } else if (e.key === 'Enter') {
        // A focused real button (Pass confirm, a sheet action) keeps its
        // native Enter — except deck keys themselves, where focus is just
        // residue from clicking chiclets and Enter should mean Play.
        if (t?.tagName === 'BUTTON' && !t.closest('[data-deck]')) return
        e.preventDefault()
        ref.current.onPlay()
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [enabled])
}
