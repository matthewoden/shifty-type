// The "ring me" master switch. Notifications are one device-wide preference:
// when on, every seat this device holds — current and future — is subscribed
// so any match can nudge, with no per-game tapping. Turning it off clears the
// device from every seat. New matches enroll themselves as they open (see
// enrollMatch), so the switch keeps applying to games created after it flipped
// on. The per-match bell button is just another way to flip this same switch.

import { api } from '../lib/api'
import { listSeats } from './storage'
import { deviceSubscription, pushSupported } from './push'

const NOTIFY_ALL_KEY = 'wordchain.notify.all'

export function notifyAllEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFY_ALL_KEY) === '1'
  } catch {
    return false
  }
}

function setNotifyAllPref(on: boolean): void {
  try {
    localStorage.setItem(NOTIFY_ALL_KEY, on ? '1' : '0')
  } catch {
    // storage unavailable — the switch just won't persist across loads
  }
}

/** Master switch on: register this device against every seat it holds. The
 *  preference is only stored once the subscription actually exists. */
export async function enrollAllSeats(): Promise<boolean> {
  const sub = await deviceSubscription()
  if (!sub) return false
  await Promise.all(listSeats().map((s) => api.setPush(s.code, s.auth.token, sub)))
  setNotifyAllPref(true)
  return true
}

/** Master switch off: clear this device from every seat. The preference drops
 *  first, so even a failed network call leaves the switch reading "off". */
export async function unenrollAllSeats(): Promise<void> {
  setNotifyAllPref(false)
  await Promise.all(listSeats().map((s) => api.setPush(s.code, s.auth.token, null)))
}

/** Enroll a single match as it opens — so a game created after the switch was
 *  flipped on still rings, and a rotated subscription is refreshed. Silent
 *  no-op when the switch is off or push isn't available. */
export async function enrollMatch(code: string, token: string): Promise<void> {
  if (!notifyAllEnabled() || !pushSupported() || Notification.permission !== 'granted') return
  const sub = await deviceSubscription()
  if (sub) await api.setPush(code, token, sub)
}
