// Custom service worker (vite-plugin-pwa injectManifest). Two jobs:
//  1. Same offline story as before: precache the whole client, SPA fallback,
//     never touch /api/.
//  2. Web Push: show the nudge, badge the icon, and land taps on the match.

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

// registerType: 'autoUpdate' — new versions take over immediately.
self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }))

import type { NudgePayload } from './lib/protocol'

/** Badging is spotty across platforms; treat it as a bonus everywhere. */
const setBadge = () =>
  (navigator as { setAppBadge?: (n?: number) => Promise<void> }).setAppBadge?.(1).catch(() => {})

const QUIET_TAG = 'quiet-matches'

self.addEventListener('push', (event: PushEvent) => {
  let nudge: NudgePayload | null = null
  try {
    nudge = (event.data?.json() ?? null) as NudgePayload | null
  } catch {
    // Undecryptable or empty — nothing worth waking the player for.
  }
  if (!nudge?.title || !nudge.body) return
  const { title, code } = nudge
  const tag = nudge.tag ?? `match-${code}` // per-match: a newer nudge replaces the stale one
  event.waitUntil(
    (async () => {
      let body = nudge.body
      let data: { code?: string; count?: number } = { code }
      if (tag === QUIET_TAG) {
        // Several matches can go quiet on the same day; their reminders
        // share a tag so they collapse into one card. Same-tag replacement
        // doesn't re-alert, so the pile-up rings at most once.
        const existing = await self.registration.getNotifications({ tag: QUIET_TAG })
        const prior = (existing[0]?.data as { count?: number } | undefined)?.count ?? existing.length
        const count = prior + 1
        if (count > 1) {
          body = `${count} matches have gone quiet — your friends are waiting.`
          data = { count } // no single match to land on; tap opens home
        } else {
          data = { code, count }
        }
      }
      await Promise.all([
        setBadge(),
        self.registration.showNotification(title, {
          body,
          tag,
          icon: '/pwa-192.png',
          badge: '/pwa-192.png',
          data,
        }),
      ])
    })(),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const code = (event.notification.data as { code?: string } | undefined)?.code
  event.waitUntil(
    (async () => {
      // The app restores its active match itself — focus a running client if
      // there is one, otherwise open the match link directly.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (windows[0]) await windows[0].focus()
      else await self.clients.openWindow(code ? `/m/${code}` : '/')
    })(),
  )
})
