// Web Push opt-in ("nudge") for one match. Subscriptions are per-device but
// stored per-match in the Durable Object, so every open match gets a quiet
// resync once permission exists. On iOS all of this only exists inside the
// installed PWA — in a plain Safari tab `Notification` is undefined and the
// hook reports 'unsupported', hiding the UI.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

export type NudgeStatus = 'unsupported' | 'off' | 'pending' | 'on' | 'denied'

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** applicationServerKey wants raw bytes, the API hands out base64url. */
function keyBytes(b64url: string): Uint8Array {
  const padded = b64url
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

export function useNudge(code: string, token: string) {
  const [status, setStatus] = useState<NudgeStatus>(() =>
    !supported() ? 'unsupported' : Notification.permission === 'denied' ? 'denied' : 'off',
  )
  const statusRef = useRef(status)
  statusRef.current = status

  // Subscribe (reusing the browser's existing subscription when there is
  // one) and tell this match's DO where to knock.
  const sync = useCallback(async (): Promise<boolean> => {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const res = await api.pushKey()
      if (!res.ok || !res.key) return false
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(res.key) as BufferSource,
      })
    }
    const saved = await api.setPush(code, token, sub.toJSON())
    return saved.ok
  }, [code, token])

  // Permission already granted (from this or another match) → resync
  // silently so this match can nudge too.
  useEffect(() => {
    if (!supported() || Notification.permission !== 'granted') return
    let stale = false
    sync()
      .then((ok) => {
        if (!stale && ok) setStatus('on')
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [sync])

  // Fixing a "no" happens outside the app (OS settings, or re-adding the
  // PWA). Re-read the permission every time the player comes back so the
  // UI heals itself: denied → off when the OS forgot, granted → subscribed
  // without another tap.
  useEffect(() => {
    if (!supported()) return
    const recheck = () => {
      if (document.visibilityState !== 'visible') return
      const perm = Notification.permission
      const cur = statusRef.current
      if (perm === 'denied' && cur !== 'denied') setStatus('denied')
      else if (perm === 'default' && (cur === 'denied' || cur === 'on')) setStatus('off')
      else if (perm === 'granted' && cur !== 'on' && cur !== 'pending')
        sync()
          .then((ok) => ok && setStatus('on'))
          .catch(() => {})
    }
    document.addEventListener('visibilitychange', recheck)
    return () => document.removeEventListener('visibilitychange', recheck)
  }, [sync])

  /** Call from a tap — browsers require a user gesture for the prompt. */
  const enable = useCallback(async () => {
    if (!supported()) return
    setStatus('pending')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'off')
        return
      }
      setStatus((await sync()) ? 'on' : 'off')
    } catch {
      setStatus('off')
    }
  }, [sync])

  return { status, enable }
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
