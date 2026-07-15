// The invite hand-off. Once the opener has played their word, this bottom
// sheet rises: it previews what the friend receives (the opening word as
// tiles), offers a one-tap native share, and falls back to copy-link + the
// raw code on anything without navigator.share (desktop, mostly).

import { useState, type ReactNode } from 'react'
import { WordTiles } from './WordTiles'
import { ShareIcon, ClipboardIcon } from './icons'

interface InviteSheetProps {
  code: string
  /** The word the opener put on the table (null if they haven't opened yet). */
  openingWord: string | null
  /** The bell control, wired to the same nudge machinery as the rest of the match. */
  bell?: ReactNode
  onClose: () => void
}

function inviteLink(code: string): string {
  return `${window.location.origin}/m/${code}`
}

export function InviteSheet({ code, openingWord, bell, onClose }: InviteSheetProps) {
  const [copied, setCopied] = useState(false)
  const word = openingWord?.toUpperCase() ?? null

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked (old browser / insecure context) — the code is on
      // screen to read aloud, so this is a soft failure.
    }
  }

  async function share() {
    const link = inviteLink(code)
    const text = word
      ? `I opened with ${word} — your move on Shifty Type.`
      : 'Come play Shifty Type with me — your move.'
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Shifty Type', text, url: link })
        return
      } catch {
        // Cancelled or unsupported payload — fall back to copying the link.
      }
    }
    await copy(link)
  }

  return (
    <div className="fixed inset-0 bg-ink-strong/40 flex items-end z-10" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1rem))] flex flex-col items-center gap-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-11 h-1.5 rounded-full bg-board-lo -mt-2" aria-hidden />
        <h2 className="font-extrabold text-xl text-ink-strong text-balance">
          {word ? `Nice — ${word}'s on the table` : 'Invite your friend'}
        </h2>
        <p className="font-semibold text-[13.5px] text-ink -mt-1 max-w-[16rem]">
          Send the invite. Your friend opens it and it's their move.
        </p>

        {openingWord && (
          <div className="bg-board rounded-2xl px-4 py-3 flex flex-col items-center gap-2 shadow-[inset_0_0_0_2px_var(--color-board-lo)]">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-p1-lip">
              You opened with
            </span>
            <WordTiles word={openingWord} side="you" />
          </div>
        )}

        <button
          onClick={share}
          className="h-13 w-full rounded-2xl font-extrabold text-lg bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5 flex items-center justify-center gap-2"
        >
          <ShareIcon className="w-5 h-5 text-white" /> Share the invite
        </button>

        <div className="flex gap-2.5 w-full">
          <button
            onClick={() => copy(inviteLink(code))}
            className="flex-1 h-12 rounded-xl font-extrabold text-[13px] text-ink bg-board shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5 flex items-center justify-center gap-2"
          >
            <ClipboardIcon className="w-4 h-4 text-dim" />
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={() => copy(code)}
            aria-label={`Match code ${code}, tap to copy`}
            className="h-12 px-4 rounded-xl font-extrabold text-ink-strong bg-board shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5 tracking-[0.2em]"
          >
            {code}
          </button>
        </div>

        {bell}

        <button onClick={onClose} className="h-11 px-4 font-extrabold text-dim -mb-1">
          Show the board
        </button>
      </div>
    </div>
  )
}
