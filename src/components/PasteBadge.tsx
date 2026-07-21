// The "Have a game link?" pill — Flow A of mockups/paste-restore.html.
// Rendered on Home only in the installed app when NO seats are stored (the
// fresh-install moment a seat link exists for) and never after an explicit
// "Not now". One-tap happy path: the pill tap itself reads the clipboard
// (inside the gesture, so iOS shows its native paste chip); a real game link
// restores instantly and the sheet only appears when the paste misses.

import { useState } from 'react'
import { hasAnySeats, restoreSeatsFromText } from '../multi/storage'
import { ClipboardIcon } from './icons'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'
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
        <Button variant="pill" accent="white" size="sm" onClick={tryClipboard} className="self-center">
          <ClipboardIcon className="w-4 h-4 text-p1-lip" />
          Have a game link?
        </Button>
      )}
      {sheet.kind === 'ask' && (
        <Sheet onClose={() => setSheet({ kind: 'closed' })}>
          <h2 className="font-extrabold text-lg text-ink-strong">Bring your matches over</h2>
          <p className="text-body font-semibold text-ink -mt-2">
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
            className="rounded-xl border-[2.5px] border-dashed border-dim bg-board px-3 py-2 text-caption font-bold text-ink-strong break-all focus:outline-none focus:border-p1"
          />
          {fieldMiss && (
            <p className="text-body font-bold text-p2-lip -mt-2">
              Still not a game link — double-check the copy.
            </p>
          )}
          <Button variant="cta" accent="p1" onClick={submitField} disabled={!field.trim()}>
            Bring them over
          </Button>
          <Button variant="text" onClick={dismiss}>
            Not now
          </Button>
        </Sheet>
      )}
      {sheet.kind === 'done' && (
        <Sheet onClose={() => setSheet({ kind: 'closed' })}>
          <h2 className="font-extrabold text-lg text-ink-strong">Welcome back!</h2>
          <p className="text-body font-semibold text-ink -mt-2">
            {sheet.result.restored === 1
              ? 'Your match moved in, right where you left it.'
              : `${sheet.result.restored} matches moved in, right where you left them.`}
          </p>
          {sheet.result.active && (
            <Button variant="cta" accent="ink" onClick={() => onOpenMatch(sheet.result.active as string)}>
              Open your match · {sheet.result.active}
            </Button>
          )}
          <Button variant="text" onClick={() => setSheet({ kind: 'closed' })}>
            Done
          </Button>
        </Sheet>
      )}
    </>
  )
}
