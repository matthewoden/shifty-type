// The two bell sheets. SoftAskSheet is the "soft ask" that guards the
// one-shot OS permission prompt — the native dialog only ever appears after
// the player says yes to us first (on iOS a denied prompt is gone for good,
// so it's only spent on the willing). BellOffSheet is the road back for
// players who said no and changed their mind: the OS won't let a web app
// re-ask, so all we can do is point at the right switch, warmly.

import { useState } from 'react'
import { buildSeatLink } from '../multi/storage'
import { CallBellIcon } from './icons'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'
import { isIos } from './useInstallPrompt'

function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-6.5 h-6.5 rounded-full bg-p1-tint text-p1-tint-ink font-extrabold text-ui flex items-center justify-center shrink-0">
        {n}
      </span>
      <p className="text-small font-bold text-ink">{children}</p>
    </div>
  )
}

/** Shown before the OS permission prompt; onConfirm triggers the real ask
 *  (still inside the tap, so the gesture requirement holds). */
export function SoftAskSheet({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <h2 className="font-extrabold text-lg text-ink-strong flex items-center gap-2">
            <CallBellIcon className="w-5.5 h-5.5 text-p1-lip" /> Turn on notifications?
          </h2>
          <p className="text-body font-semibold text-ink -mt-2">
            We'll notify you when the game needs you — a word played, a challenge thrown, a friend
            jumped in. Nothing else, ever.
          </p>
          <p className="text-body font-semibold text-dim -mt-1">
            Your phone will ask once to make it official.
          </p>
          <Button variant="cta" accent="p1" onClick={onConfirm}>
            Turn them on
          </Button>
          <Button variant="text" onClick={close}>
            Not now
          </Button>
        </>
      )}
    </Sheet>
  )
}

/** The delete-and-re-add card, kept out of the common flow. The "game link"
 *  it copies is a seat link: the installed app's localStorage — the match
 *  tokens, i.e. the player's seats — dies with the app, so the link carries
 *  them back in via the URL fragment (plus ?install=1 for the add steps). */
function ReAddCard({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const copy = () => {
    navigator.clipboard
      .writeText(buildSeatLink())
      .then(() => setCopied(true))
      .catch(() => setShowLink(true)) // clipboard blocked — show it to select
  }
  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <h2 className="font-extrabold text-lg text-ink-strong">One extra step</h2>
          <p className="text-body font-semibold text-ink -mt-2">
            You'll need to delete and re-add the game. Copy this link to open the web version, then
            click Add to Home Screen.
          </p>
          <Button variant="cta" accent="p1" onClick={copy}>
            {copied ? 'Copied!' : 'Copy game link'}
          </Button>
          {showLink && (
            <p className="text-caption font-bold text-ink-strong bg-board rounded-xl px-3 py-2 break-all select-all">
              {buildSeatLink()}
            </p>
          )}
          <Button variant="text" onClick={close}>
            Got it
          </Button>
        </>
      )}
    </Sheet>
  )
}

/** The way back after a "no": the OS blocks re-asking, so these are the
 *  per-platform switch-flipping steps. useNudge notices the flip when the
 *  player returns and hooks the bell up on its own. */
export function BellOffSheet({ onClose }: { onClose: () => void }) {
  const ios = isIos()
  const [readd, setReadd] = useState(false)
  if (readd) return <ReAddCard onClose={onClose} />
  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <h2 className="font-extrabold text-lg text-ink-strong flex items-center gap-2">
            <CallBellIcon className="w-5.5 h-5.5 text-dim" /> Notifications are switched off
          </h2>
          <p className="text-body font-semibold text-ink -mt-2">
            Your phone said no to notifications a while back, and it won't let us ask twice.
            Flipping the switch takes two seconds:
          </p>
          {ios ? (
            <>
              <Step n="1">
                Open <b className="text-ink-strong">Settings → Notifications</b>
              </Step>
              <Step n="2">
                Find <b className="text-ink-strong">Shifty Type</b> and tap it
              </Step>
              <Step n="3">
                Turn on <b className="text-ink-strong">Allow Notifications</b>
              </Step>
            </>
          ) : (
            <>
              <Step n="1">
                Press and hold the <b className="text-ink-strong">Shifty Type</b> icon
              </Step>
              <Step n="2">
                Tap <b className="text-ink-strong">App info</b>
              </Step>
              <Step n="3">
                Turn on <b className="text-ink-strong">Notifications</b>
              </Step>
              <p className="text-body font-semibold text-dim">
                Playing in the browser instead? Tap the padlock by the address and allow
                notifications there.
              </p>
            </>
          )}
          <p className="text-body font-semibold text-ink">And that's it! You're all set.</p>
          {ios && (
            <button
              onClick={() => setReadd(true)}
              className="text-left text-body font-bold text-p1-lip"
            >
              Not in the list? One extra step →
            </button>
          )}
          <Button variant="cta" accent="ink" onClick={close}>
            Got it
          </Button>
        </>
      )}
    </Sheet>
  )
}
