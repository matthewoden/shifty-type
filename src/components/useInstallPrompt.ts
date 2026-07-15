// Install-badge plumbing. Chrome fires beforeinstallprompt once, often
// before React mounts, so it's captured at module load and re-used when the
// player taps Add. iOS never fires it — there we detect Safari-not-standalone
// and the badge opens a how-to sheet instead.

import { useSyncExternalStore } from 'react'
import { buildSeatLink } from '../multi/storage'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'wordchain.install.dismissed'

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  installed = true
  deferred = null
  notify()
})

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** iOS Safari proper. Chrome/Firefox/Edge on iOS badge their UA; Brave wears
 *  Safari's exact UA and needs its navigator.brave marker instead. Non-Safari
 *  iOS browsers either can't pin to the home screen at all (Brave) or hide it
 *  behind different menus, so they get the Safari hand-off. */
function isIosSafari(): boolean {
  const ua = navigator.userAgent
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua) && !('brave' in navigator)
}

export type InstallKind = 'native' | 'ios' | 'handoff' | null

function snapshot(): InstallKind {
  if (installed || isStandalone()) return null
  if (deferred) return 'native'
  if (isIos()) return isIosSafari() ? 'ios' : 'handoff'
  return null
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** How the badge can install right now: one-tap native prompt, iOS how-to
 *  sheet, or not at all (already installed / browser can't). */
export function useInstallKind(): InstallKind {
  return useSyncExternalStore(subscribe, snapshot)
}

/** Open Chrome's native install sheet with the captured event. The event is
 *  single-use: if the player backs out, the badge hides until Chrome fires a
 *  fresh one (typically next visit). */
export async function promptInstall(): Promise<void> {
  const evt = deferred
  if (!evt) return
  deferred = null
  await evt.prompt()
  const { outcome } = await evt.userChoice
  if (outcome === 'accepted') installed = true
  notify()
}

/** Hop to Safari via its x-safari-https scheme. Undocumented and ignored by
 *  some browsers/iOS versions, so callers must show a manual fallback too.
 *  Both hop links are seat links: this browser may hold the player's match
 *  tokens (e.g. a seat link opened in Brave restores here first), and the
 *  hop must hand them on or Safari arrives seatless. */
export function safariHandoffUrl(): string {
  return buildSeatLink().replace(/^https:\/\//, 'x-safari-https://')
}

/** The plain link for the copy-and-paste fallback. */
export function installLinkUrl(): string {
  return buildSeatLink()
}

/** True once when the page was opened via a hand-off link; strips the param
 *  so a reload doesn't re-open the sheet. */
export function consumeInstallLink(): boolean {
  const params = new URLSearchParams(location.search)
  if (!params.has('install')) return false
  params.delete('install')
  const qs = params.toString()
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''))
  return true
}

export function loadCardDismissed(): boolean {
  return localStorage.getItem(DISMISSED_KEY) === '1'
}

export function saveCardDismissed(): void {
  localStorage.setItem(DISMISSED_KEY, '1')
}
