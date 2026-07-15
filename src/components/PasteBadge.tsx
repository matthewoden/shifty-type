// The "Have a game link?" pill — Flow A of mockups/paste-restore.html.
// Rendered on Home only in the installed app when NO seats are stored (the
// fresh-install moment a seat link exists for) and never after an explicit
// "Not now". One-tap happy path: the pill tap itself reads the clipboard
// (inside the gesture, so iOS shows its native paste chip); a real game link
// restores instantly and the sheet only appears when the paste misses.

import { useState } from 'react'
import { hasAnySeats, restoreSeatsFromText } from '../multi/storage'
import { ClipboardIcon } from './icons'
import { isStandalone } from './useInstallPrompt'

const DISMISSED_KEY = 'wordchain.paste.dismissed'

type Restored = { restored: number; active: string | null }
type SheetState =
  | { kind: 'closed' }
  | { kind: 'ask'; miss: boolean } // miss: a paste happened but wasn't a link
  | { kind: 'done'; result: Restored }

export function PasteBadge({
  onOpenMatch,
  onRestored,
}: {
  onOpenMatch: (code: string) => void
  onRestored: () => void
}) {
  const [sheet, setSheet] = useState<SheetState>({ kind: 'closed' })
  const [hidden, setHidden] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
  const [field, setField] = useState('')
  const [fieldMiss, setFieldMiss] = useState(false)

  if (hidden || !isStandalone() || hasAnySeats()) {
    if (sheet.kind === 'done') {
      // Seats now exist, so the pill condition is false — but the success
      // sheet must finish its job before the component goes quiet.
    } else {
      return null
    }
  }

  const adopt = (result: Restored) => {
    setSheet({ kind: 'done', result })
    onRestored()
  }

  /** The pill tap: read the clipboard inside the gesture and shortcut the
   *  whole flow when it holds a real game link. */
  const tryClipboard = () => {
    navigator.clipboard
      .readText()
      .then((text) => {
        const result = restoreSeatsFromText(text)
        if (result) adopt(result)
        else setSheet({ kind: 'ask', miss: text.trim().length > 0 })
      })
      .catch(() => setSheet({ kind: 'ask', miss: false })) // read blocked — ask for a manual paste
  }

  const submitField = () => {
    const result = restoreSeatsFromText(field)
    if (result) adopt(result)
    else setFieldMiss(true)
  }

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setHidden(true)
    setSheet({ kind: 'closed' })
  }

  return (
    <>
      {sheet.kind === 'closed' && (
        <button
          onClick={tryClipboard}
          className="h-10 px-4 rounded-full self-center bg-white shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5 flex items-center gap-2 font-extrabold text-[13px] text-ink"
        >
          <ClipboardIcon className="w-4 h-4 text-p1-lip" />
          Have a game link?
        </button>
      )}
      {sheet.kind === 'ask' && (
        <div
          className="fixed inset-0 bg-ink-strong/40 flex items-end z-10"
          onClick={() => setSheet({ kind: 'closed' })}
        >
          <div
            className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1rem))] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-extrabold text-lg text-ink-strong">Bring your matches over</h2>
            <p className="text-[13px] font-semibold text-ink -mt-2">
              {sheet.miss
                ? "Hmm — that didn't look like a game link. Drop it here instead:"
                : 'Copied a game link? Drop it here and your matches follow you in:'}
            </p>
            <textarea
              value={field}
              onChange={(e) => {
                setField(e.target.value)
                setFieldMiss(false)
              }}
              rows={3}
              placeholder="https://shifty-type…#seats=…"
              className="rounded-xl border-[2.5px] border-dashed border-dim bg-board px-3 py-2 text-[12px] font-bold text-ink-strong break-all focus:outline-none focus:border-p1"
            />
            {fieldMiss && (
              <p className="text-[13px] font-bold text-p2-lip -mt-2">
                Still not a game link — double-check the copy.
              </p>
            )}
            <button
              onClick={submitField}
              disabled={!field.trim()}
              className="h-13 rounded-2xl font-extrabold bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] active:translate-y-0.5 disabled:opacity-50"
            >
              Bring them over
            </button>
            <button onClick={dismiss} className="h-11 rounded-xl font-extrabold text-dim">
              Not now
            </button>
          </div>
        </div>
      )}
      {sheet.kind === 'done' && (
        <div
          className="fixed inset-0 bg-ink-strong/40 flex items-end z-10"
          onClick={() => setSheet({ kind: 'closed' })}
        >
          <div
            className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1rem))] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-extrabold text-lg text-ink-strong">Welcome back!</h2>
            <p className="text-[13px] font-semibold text-ink -mt-2">
              {sheet.result.restored === 1
                ? 'Your match moved in, right where you left it.'
                : `${sheet.result.restored} matches moved in, right where you left them.`}
            </p>
            {sheet.result.active && (
              <button
                onClick={() => onOpenMatch(sheet.result.active as string)}
                className="h-13 rounded-2xl font-extrabold bg-ink-strong text-white shadow-[0_4px_0_#262E38] active:translate-y-0.5"
              >
                Open your duel · {sheet.result.active}
              </button>
            )}
            <button
              onClick={() => setSheet({ kind: 'closed' })}
              className="h-11 rounded-xl font-extrabold text-dim"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  )
}
