// The nudge that needs no permission. When it's the friend's move, this sheet
// composes a short note — the word on the table plus the deep link back to
// their seat — and hands it to the native share sheet, so the poke arrives as
// a regular text from the player, not a notification from us. Nothing touches
// the server: /m/CODE already knows the way back in (stored seat token opens
// the match; a new phone lands on the invite screen).

import { useState } from 'react'
import { ClipboardIcon, PaperPlaneTiltIcon } from './icons'

interface NoteSheetProps {
  code: string
  friendName: string
  /** The word sitting on the table (null when the friend opens a fresh chain). */
  tableWord: string | null
  onClose: () => void
}

/** The note as it sends — the preview below renders exactly this text. */
function noteText(tableWord: string | null): string {
  return tableWord
    ? `Psst — ${tableWord.toUpperCase()} is on the table and it's your move. No rush… well, some rush.`
    : "Psst — it's your move. No rush… well, some rush."
}

export function NoteSheet({ code, friendName, tableWord, onClose }: NoteSheetProps) {
  const [copied, setCopied] = useState(false)
  const text = noteText(tableWord)
  const link = `${window.location.origin}/m/${code}`

  async function copyNote() {
    try {
      await navigator.clipboard.writeText(`${text} ${link}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked (old browser / insecure context) — the note is on
      // screen to read, so this is a soft failure.
    }
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Shifty Type', text, url: link })
        return
      } catch {
        // Cancelled or unsupported payload — fall back to copying the note.
      }
    }
    await copyNote()
  }

  return (
    <div className="fixed inset-0 bg-ink-strong/40 flex items-end z-10" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1rem))] flex flex-col items-center gap-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-11 h-1.5 rounded-full bg-board-lo -mt-2" aria-hidden />
        <h2 className="font-extrabold text-xl text-ink-strong text-balance">
          Slide {friendName} a note?
        </h2>
        <p className="font-semibold text-[13.5px] text-ink -mt-1 max-w-[17rem]">
          It sends as a regular text — straight from you, not from us.
        </p>

        <div className="bg-board rounded-2xl px-4 py-3.5 w-full text-left shadow-[inset_0_0_0_2px_var(--color-board-lo)]">
          <p className="text-[14.5px] font-semibold text-ink">
            {tableWord ? (
              <>
                Psst — <b className="text-ink-strong">{tableWord.toUpperCase()}</b> is on the
                table and it&apos;s your move. No rush… well, some rush.
              </>
            ) : (
              text
            )}
          </p>
          <p className="mt-2 text-[12.5px] font-bold text-p1-lip break-all">{link}</p>
        </div>

        <button
          onClick={share}
          className="h-13 w-full rounded-2xl font-extrabold text-lg bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5 flex items-center justify-center gap-2"
        >
          <PaperPlaneTiltIcon className="w-5 h-5 text-white" /> Send the note
        </button>

        <button
          onClick={copyNote}
          className="h-12 w-full rounded-xl font-extrabold text-[13px] text-ink bg-board shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5 flex items-center justify-center gap-2"
        >
          <ClipboardIcon className="w-4 h-4 text-dim" />
          {copied ? 'Copied!' : 'Copy the note'}
        </button>

        <button onClick={onClose} className="h-11 px-4 font-extrabold text-dim -mb-1">
          Let them mull
        </button>
      </div>
    </div>
  )
}
