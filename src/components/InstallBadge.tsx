// The install badge on Home: a dismissible table-talk card that demotes to a
// quiet pill under the menu. Chrome's Add opens the native install sheet; on
// iOS Safari it opens a how-to sheet (Share → Add to Home Screen) instead.
// Mockup: mockups/install-badge.html.

import { useState } from 'react'
import { DeviceMobileIcon, PlusSquareIcon, ShareIcon } from './icons'
import {
  consumeInstallLink,
  installLinkUrl,
  loadCardDismissed,
  promptInstall,
  safariHandoffUrl,
  saveCardDismissed,
  useInstallKind,
  type InstallKind,
} from './useInstallPrompt'

export function IosHowToSheet({ onClose }: { onClose: () => void }) {
  const steps: [string, React.ReactNode, React.ReactNode][] = [
    ['1', <>Tap <b className="text-ink-strong">Share</b> in the bar below</>, <ShareIcon className="w-5 h-5" />],
    ['2', <>Scroll down to <b className="text-ink-strong">Add to Home Screen</b></>, <PlusSquareIcon className="w-5 h-5" />],
    ['3', <>Tap <b className="text-ink-strong">Add</b> — your seat's saved</>, null],
  ]
  return (
    <div className="fixed inset-0 bg-ink-strong/40 flex items-end z-10" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1rem))] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-extrabold text-lg text-ink-strong">Put it on your phone</h2>
        <p className="text-[13px] font-semibold text-ink -mt-2">
          Safari can pin Shifty Type to your home screen — it opens like an app, notifies you
          when it's your move, and llama games work with no wifi.
        </p>
        {steps.map(([n, copy, glyph]) => (
          <div key={n} className="flex items-center gap-3">
            <span className="w-6.5 h-6.5 rounded-full bg-p1-tint text-p1-tint-ink font-extrabold text-[13px] flex items-center justify-center shrink-0">
              {n}
            </span>
            <p className="text-sm font-bold text-ink">{copy}</p>
            {glyph && (
              <span className="w-7.5 h-7.5 rounded-lg bg-board text-p1-lip flex items-center justify-center shrink-0 ml-auto">
                {glyph}
              </span>
            )}
          </div>
        ))}
        <button
          onClick={onClose}
          className="h-13 rounded-2xl font-extrabold bg-ink-strong text-white shadow-[0_4px_0_#262E38] active:translate-y-0.5"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

/** Hops a wrong-browser player to Safari. The hop is a real link the player
 *  taps (never an auto-navigation) so the page stays theirs if the
 *  undocumented x-safari-https scheme gets ignored — the visible link and
 *  copy button are the manual fallback for that case. */
export function SafariHandoffSheet({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard
      .writeText(installLinkUrl())
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }
  return (
    <div className="fixed inset-0 bg-ink-strong/40 flex items-end z-10" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1rem))] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-extrabold text-lg text-ink-strong">Safari does this bit</h2>
        <p className="text-[13px] font-semibold text-ink -mt-2">
          This browser can't pin the game to your home screen. Hop over to Safari and the
          home-screen steps will be waiting:
        </p>
        <a
          href={safariHandoffUrl()}
          className="h-13 rounded-2xl font-extrabold bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] active:translate-y-0.5 flex items-center justify-center"
        >
          Open in Safari
        </a>
        <p className="text-[13px] font-semibold text-ink">
          If nothing happens, copy the link and paste it into Safari:
        </p>
        <p className="text-[13px] font-bold text-ink-strong bg-board rounded-xl px-3 py-2 break-all select-all">
          {installLinkUrl()}
        </p>
        <button
          onClick={copy}
          className="h-11 rounded-xl font-extrabold text-p1-lip bg-white shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5"
        >
          {copied ? 'Copied!' : 'Copy the link'}
        </button>
        <button onClick={onClose} className="h-11 rounded-xl font-extrabold text-dim">
          Done
        </button>
      </div>
    </div>
  )
}

function InstallCard({ onAdd, onDismiss }: { onAdd: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-5 px-4 flex justify-center z-10">
      <div className="relative w-full max-w-[398px] bg-white rounded-[18px] shadow-[0_4px_0_#E2DDD3] p-3.5 pl-4 flex items-center gap-3">
        <span className="w-10 h-11 rounded-[11px] bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] flex items-center justify-center font-extrabold text-[22px] shrink-0">
          s
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-[15px] leading-tight text-ink-strong">
            Put it on your phone
          </p>
          <p className="text-xs font-semibold text-ink leading-snug mt-0.5">
            No app store. It notifies you when it's your move — and llama games need no
            wifi at all.
          </p>
        </div>
        <button
          onClick={onAdd}
          className="h-11 px-4.5 rounded-[13px] font-extrabold text-sm bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] active:translate-y-0.5 shrink-0"
        >
          Add
        </button>
        <button
          onClick={onDismiss}
          aria-label="No thanks"
          className="absolute -top-2 -right-1.5 w-6.5 h-6.5 rounded-full bg-ink-strong text-white font-extrabold text-sm leading-none flex items-center justify-center shadow-[0_2px_0_#262E38]"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function InstallPill({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="h-10 px-4 rounded-full self-center bg-white shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5 flex items-center gap-2 font-extrabold text-[13px] text-ink"
    >
      <DeviceMobileIcon className="w-4 h-4 text-p1-lip" />
      Add to home screen
    </button>
  )
}

/** Rendered at the end of Home's button stack: the pill sits there inline,
 *  the card and sheet position themselves. */
export function InstallBadge() {
  const kind: InstallKind = useInstallKind()
  const [dismissed, setDismissed] = useState(loadCardDismissed)
  // A hand-off link (?install=1) lands with the how-to steps already open.
  const [sheetOpen, setSheetOpen] = useState(() => kind === 'ios' && consumeInstallLink())
  if (!kind) return null

  const add = () => {
    if (kind === 'native') void promptInstall()
    else setSheetOpen(true)
  }
  const dismiss = () => {
    saveCardDismissed()
    setDismissed(true)
  }

  return (
    <>
      {dismissed ? <InstallPill onAdd={add} /> : <InstallCard onAdd={add} onDismiss={dismiss} />}
      {sheetOpen &&
        (kind === 'handoff' ? (
          <SafariHandoffSheet onClose={() => setSheetOpen(false)} />
        ) : (
          <IosHowToSheet onClose={() => setSheetOpen(false)} />
        ))}
    </>
  )
}
