// The invite hand-off. Once the opener has played their word, this bottom
// sheet rises: it previews what the friend receives (the opening word as
// tiles), offers a one-tap native share, and falls back to copy-link + the
// raw code on anything without navigator.share (desktop, mostly).

import { useState, type ReactNode } from 'react'
import { TileRail } from './WordTiles'
import { ShareIcon, ClipboardIcon } from './icons'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'

/** Openers longer than this get the hat-tip headline — saying a 28-letter
 *  word in the h2 costs three lines; the tiles below still say it exactly. */
const MOUTHFUL = 15

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
    <Sheet onClose={onClose} cardClass="items-center gap-4 text-center">
      {(close) => (
        <>
          <h2 className="font-extrabold text-headline text-ink-strong text-balance">
            {!word
              ? 'Invite your friend'
              : word.length >= MOUTHFUL
                ? "Nice — that's a whole mouthful to open with"
                : `Nice — ${word}'s in play`}
          </h2>
          <p className="font-semibold text-body text-ink -mt-1 max-w-[16rem]">
            Send the invite. Your friend opens it and it's their move.
          </p>

          {openingWord && (
            <div className="bg-board rounded-2xl py-3 w-full flex flex-col items-center gap-2 shadow-[inset_0_0_0_2px_var(--color-board-lo)]">
              <span className="text-label font-extrabold uppercase tracking-wider text-p1-lip">
                You opened with
              </span>
              {/* A long opener rides the rail — one proud line, swipe to read;
                  the peek glide advertises the swipe as the sheet opens. */}
              <TileRail word={openingWord} side="you" align="center" peek className="w-full" />
            </div>
          )}

          <Button variant="cta" accent="p2" onClick={share} className="w-full text-lg">
            <ShareIcon className="w-5 h-5 text-white" /> Share the invite
          </Button>

          <div className="flex gap-2.5 w-full">
            <button
              onClick={() => copy(inviteLink(code))}
              className="flex-1 h-12 rounded-xl font-extrabold text-ui text-ink bg-board shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5 flex items-center justify-center gap-2"
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

          <Button variant="text" onClick={close} className="-mb-1">
            Show the board
          </Button>
        </>
      )}
    </Sheet>
  )
}
