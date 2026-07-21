// The deck: a custom in-app keyboard in board style. 26 chiclet letter keys
// plus backspace — never the system keyboard (viewport jumps, autocorrect
// mangling bluffs). Submit does NOT live here — Play rides the chain (see
// ChainLedger), a full deck-row away from backspace. Pass doesn't either:
// it's a real button in the top bar (PassButton below), a whole screen away
// from the keys and still behind its two-step confirm.

import { useEffect, useState } from 'react'
import type { KeyHints } from '../game'

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

interface DeckProps {
  disabled: boolean
  /** Slide up on mount — multiplayer, where the deck's arrival is the turn signal. */
  rise?: boolean
  /** Tutorial-only: this letter's key glows indigo (the guided next press). */
  glowKey?: string
  /** Real play: light the legal next letters, grey the rest. Null = free-form. */
  keyHints?: KeyHints | null
  onKey: (letter: string) => void
  onBackspace: () => void
}

const KEY =
  'flex-1 max-w-[34px] h-12 bg-white rounded-[7px] shadow-[0_3px_0_#DDD8CE] flex items-center justify-center font-extrabold text-base uppercase text-ink-strong select-none active:translate-y-0.5 active:shadow-[0_1px_0_#DDD8CE] disabled:opacity-40 disabled:active:translate-y-0'
// The one forced next letter (or the tutorial's guided key): solid indigo.
const KEY_GLOW = '!bg-p1 !text-white !shadow-[0_3px_0_var(--color-p1-lip)]'
// A legal-but-optional starter: soft indigo tint.
const KEY_LIT = '!bg-p1-tint !text-p1-tint-ink !shadow-[0_3px_0_var(--color-p1-tint-lip)]'
// An illegal next letter: flattened, and disabled so it dims via disabled:opacity-40.
const KEY_OFF = '!shadow-[0_1px_0_#DDD8CE]'

/** How one letter key should look given the tutorial glow and/or live hints. */
function keyStyle(letter: string, glowKey: string | undefined, hints: KeyHints | null | undefined) {
  if (letter === glowKey) return { cls: KEY_GLOW, off: false }
  if (!hints) return { cls: '', off: false }
  if (letter === hints.forced) return { cls: KEY_GLOW, off: false }
  if (hints.valid.includes(letter)) return { cls: KEY_LIT, off: false }
  return { cls: KEY_OFF, off: true }
}

/** The chiclet-down look for a physical keypress, inline so it composes with
 *  any key variant: the dip always lands; the flattened lip only shows on
 *  plain keys (the lit/glow shadows are !important, same as under a real
 *  tap's active:). */
const PRESSED_STYLE = { translate: '0 2px', boxShadow: '0 1px 0 #DDD8CE' } as const
const PRESS_MS = 130

export function Deck({ disabled, rise = false, glowKey, keyHints, onKey, onBackspace }: DeckProps) {
  // Physical typing echoes on the deck: useDeckKeyboard announces each press
  // and the matching chiclet dips like a tap, so desktop players see their
  // keystrokes land on the board's own keyboard.
  const [pressed, setPressed] = useState<string | null>(null)
  useEffect(() => {
    let timer: number | undefined
    const onPress = (e: Event) => {
      setPressed((e as CustomEvent<string>).detail)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setPressed(null), PRESS_MS)
    }
    window.addEventListener('deckpress', onPress)
    return () => {
      window.removeEventListener('deckpress', onPress)
      window.clearTimeout(timer)
    }
  }, [])
  return (
    // Installed to the home screen, the page runs under the iOS home
    // indicator — pad the deck past it (max() keeps 1rem in browsers).
    <div
      data-deck
      className={`bg-[#E7E2D9] px-1.5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-1.5 ${rise ? 'deck-rise' : ''}`}
    >
      {KEY_ROWS.map((row, i) => (
        <div key={row} className={`flex gap-[5px] justify-center ${i === 1 ? 'px-4' : ''}`}>
          {row.split('').map((letter) => {
            const style = keyStyle(letter, glowKey, keyHints)
            return (
              <button
                key={letter}
                type="button"
                disabled={disabled || style.off}
                onClick={() => onKey(letter)}
                className={style.cls ? `${KEY} ${style.cls}` : KEY}
                style={pressed === letter && !disabled && !style.off ? PRESSED_STYLE : undefined}
              >
                {letter}
              </button>
            )
          })}
          {i === 2 && (
            <button
              type="button"
              disabled={disabled}
              onClick={onBackspace}
              aria-label="Backspace"
              className={`${KEY} max-w-[54px] flex-[1.6] text-lg text-ink`}
              style={pressed === 'backspace' && !disabled ? PRESSED_STYLE : undefined}
            >
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** Pass as a real button — top bar, opposite corner of the screen from the
 *  keys, still behind its two-step confirm (it costs a life). */
export function PassButton({ disabled, onPass }: { disabled: boolean; onPass: () => void }) {
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (disabled) setConfirm(false)
  }, [disabled])

  if (confirm)
    return (
      <div className="fixed inset-x-0 top-0 z-20 max-w-[430px] mx-auto bg-board px-3.5 py-2 flex items-center gap-2.5 shadow-[0_3px_0_#E2DDD3]">
        <span className="text-[13px] font-bold text-ink">Pass and lose a life?</span>
        <button
          type="button"
          onClick={() => {
            setConfirm(false)
            onPass()
          }}
          className="ml-auto h-10 px-3.5 rounded-xl font-extrabold text-[13px] bg-p2 text-white shadow-[0_3px_0_var(--color-p2-lip)] active:translate-y-0.5"
        >
          Yes, Pass
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="h-10 px-3.5 rounded-xl font-extrabold text-[13px] bg-white text-ink shadow-[0_3px_0_#DDD8CE] active:translate-y-0.5"
        >
          Wait, no
        </button>
      </div>
    )
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setConfirm(true)}
      className="h-11 px-4 rounded-[13px] font-extrabold text-[13px] bg-white text-ink shadow-[0_4px_0_#E2DDD3] active:translate-y-0.5 active:shadow-[0_2px_0_#E2DDD3] disabled:opacity-40 disabled:active:translate-y-0"
    >
      Pass?
    </button>
  )
}
