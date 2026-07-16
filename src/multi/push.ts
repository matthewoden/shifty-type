// Shared Web Push plumbing for the browser side. The device has one push
// subscription (minted from the server's VAPID key); it's registered per-match
// in each Durable Object. On iOS all of this only exists inside the installed
// PWA — in a plain Safari tab `Notification` is undefined and callers treat
// push as unsupported.

import { api } from '../lib/api'

export function pushSupported(): boolean {
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

/** This device's push subscription — the browser's existing one, or a fresh
 *  one minted from the server's VAPID key. Null when push can't be set up. */
export async function deviceSubscription(): Promise<PushSubscriptionJSON | null> {
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const res = await api.pushKey()
    if (!res.ok || !res.key) return null
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(res.key) as BufferSource,
    })
  }
  return sub.toJSON()
}
