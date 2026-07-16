// React glue for the "ring me" master switch (see notify.ts). One device-wide
// state, surfaced two ways: the in-match bell button (useNudge(code, token))
// and the settings toggle (useNudge()). Both flip the same switch. On iOS none
// of this exists outside the installed PWA, where the hook reports
// 'unsupported' and the UI hides itself.

import { useCallback, useEffect, useRef, useState } from 'react'
import { enrollAllSeats, enrollMatch, notifyAllEnabled, unenrollAllSeats } from './notify'
import { pushSupported } from './push'

export type NudgeStatus = 'unsupported' | 'off' | 'pending' | 'on' | 'denied'

function initialStatus(): NudgeStatus {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return notifyAllEnabled() && Notification.permission === 'granted' ? 'on' : 'off'
}

export function useNudge(code?: string, token?: string) {
  const [status, setStatus] = useState<NudgeStatus>(initialStatus)
  const statusRef = useRef(status)
  statusRef.current = status

  // The switch is already on and this match just opened — make sure it's
  // subscribed (it may be newer than the switch, or the subscription rotated).
  useEffect(() => {
    if (!code || !token) return
    if (!pushSupported() || Notification.permission !== 'granted' || !notifyAllEnabled()) return
    enrollMatch(code, token)
      .then(() => setStatus((s) => (s === 'off' ? 'on' : s)))
      .catch(() => {})
  }, [code, token])

  // Permission changes happen outside the app (OS settings, re-adding the PWA).
  // Re-read on return so the UI heals: denied → off when the OS forgot, and a
  // switch left on stays reflected as on once permission is back.
  useEffect(() => {
    if (!pushSupported()) return
    const recheck = () => {
      if (document.visibilityState !== 'visible') return
      const perm = Notification.permission
      const cur = statusRef.current
      if (cur === 'unsupported' || cur === 'pending') return
      if (perm === 'denied') {
        if (cur !== 'denied') setStatus('denied')
      } else if (perm === 'default') {
        if (cur !== 'off') setStatus('off')
      } else {
        // granted — mirror the stored preference
        const want: NudgeStatus = notifyAllEnabled() ? 'on' : 'off'
        if (cur !== want) setStatus(want)
      }
    }
    document.addEventListener('visibilitychange', recheck)
    return () => document.removeEventListener('visibilitychange', recheck)
  }, [])

  /** Turn the switch on. Call from a tap — the OS prompt needs a gesture. */
  const enable = useCallback(async () => {
    if (!pushSupported()) return
    setStatus('pending')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'off')
        return
      }
      setStatus((await enrollAllSeats()) ? 'on' : 'off')
    } catch {
      setStatus('off')
    }
  }, [])

  /** Turn the switch off everywhere. */
  const disable = useCallback(async () => {
    setStatus('off')
    try {
      await unenrollAllSeats()
    } catch {
      // seats will re-sync next time the switch goes on
    }
  }, [])

  return { status, enable, disable }
}

/** Clear the home-screen badge whenever the player is actually looking. */
export function useClearBadge(): void {
  useEffect(() => {
    const clear = () => {
      if (document.visibilityState !== 'visible') return
      void (navigator as { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {})
    }
    clear()
    document.addEventListener('visibilitychange', clear)
    return () => document.removeEventListener('visibilitychange', clear)
  }, [])
}
