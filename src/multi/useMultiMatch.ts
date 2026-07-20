// Multiplayer match state driven by the Durable Object. A hibernating
// WebSocket is the primary line — the DO pushes a fresh view the moment
// anything happens. Polling (8s, visible tab, not our move) survives as the
// fallback for flakey wifi, and both paths dedupe on `revision`.

import { useCallback, useEffect, useRef, useState } from 'react'
import { lastCallActorOf } from '../game'
import { api } from '../lib/api'
import type { ClientMove, LastEvent, MatchView, SocketPush } from '../lib/protocol'

/** A resolved challenge (STANDS/REJECTED) gets a full-screen stamp; the rest
 *  get toasts. */
export type StampEvent = Extract<LastEvent, { kind: 'real' | 'fake' }>

const POLL_MS = 8000
// Client-side heartbeat: the runtime answers 'ping' without waking the DO,
// so this only spends battery, not request quota. One missed pong = the
// socket silently died (radio handoff, dead wifi) → close and reconnect.
const HEARTBEAT_MS = 25_000
const RECONNECT_MAX_MS = 30_000

/** Is the local player the one who must act right now? Challenges resolve
 *  instantly, so it's whose turn the phase names — or, at last call, whoever
 *  didn't play the final word. */
function myMove(view: MatchView): boolean {
  const { state, you } = view
  if (state.phase === 'P1_TURN') return you === 'p1'
  if (state.phase === 'P2_TURN') return you === 'p2'
  if (state.phase === 'LAST_CALL') return lastCallActorOf(state) === you
  return false
}

export function useMultiMatch(code: string, token: string) {
  const [view, setView] = useState<MatchView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [stamp, setStamp] = useState<StampEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [lost, setLost] = useState<string | null>(null) // fatal: bad token / gone
  const [live, setLive] = useState(false) // socket open — updates arrive pushed
  const viewRef = useRef<MatchView | null>(null)
  const liveRef = useRef(false)

  const adopt = useCallback((next: MatchView, quiet = false) => {
    const prev = viewRef.current
    // Push and poll race each other; never let a slow HTTP response roll the
    // table back over a fresher socket push.
    if (prev && next.revision < prev.revision) return
    const ev = next.lastEvent
    if (prev && next.revision !== prev.revision && ev) {
      if (ev.kind === 'real' || ev.kind === 'fake') {
        // Both players see the verdict stamp, whoever triggered it.
        setStamp(ev)
      } else if (!quiet && ev.by !== next.you) {
        const name = next.state.players[ev.by].name
        if (ev.kind === 'play') setToast(`${name} played ${ev.word.toUpperCase()}`)
        else if (ev.kind === 'pass')
          setToast(
            ev.snapped
              ? `${name} passed too — snap!`
              : `${name} passes — a life slips away`,
          )
        else if (ev.kind === 'rematch') setToast('New chain — rematch!')
      }
    }
    viewRef.current = next
    setView(next)
  }, [])

  const refresh = useCallback(async () => {
    const current = viewRef.current
    const r = await api.get(code, token, current?.revision)
    if (!r.ok) {
      if (!('offline' in r)) setLost(r.error) // token rejected or match deleted
      return
    }
    if ('unchanged' in r && r.unchanged) {
      // Same table, but seats may have filled or emptied.
      const cur = viewRef.current
      if (
        cur &&
        r.presence &&
        (cur.presence.p1 !== r.presence.p1 || cur.presence.p2 !== r.presence.p2)
      ) {
        const next = { ...cur, presence: r.presence }
        viewRef.current = next
        setView(next)
      }
      return
    }
    if ('view' in r) adopt(r.view)
  }, [code, token, adopt])

  // Initial load.
  useEffect(() => {
    void refresh()
  }, [refresh])

  // The live socket. Connect while visible; the DO pushes a full view on
  // open (initial sync) and after every state or presence change. Mobile
  // browsers kill the socket in the background — we reconnect on return.
  useEffect(() => {
    let ws: WebSocket | null = null
    let gone = false // effect cleaned up
    let attempts = 0
    let reconnectTimer: number | undefined
    let awaitingPong = false

    const connect = () => {
      if (gone || document.visibilityState !== 'visible') return
      if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN))
        return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(
        `${proto}://${location.host}/api/match/${code}/ws?token=${encodeURIComponent(token)}`,
      )
      ws.onopen = () => {
        attempts = 0
        awaitingPong = false
        liveRef.current = true
        setLive(true)
      }
      ws.onmessage = (e) => {
        if (e.data === 'pong') {
          awaitingPong = false
          return
        }
        try {
          const push = JSON.parse(e.data as string) as SocketPush
          if (push.type === 'view') adopt(push.view)
        } catch {
          // Not for us; ignore.
        }
      }
      ws.onclose = () => {
        liveRef.current = false
        setLive(false)
        awaitingPong = false
        if (gone) return
        const backoff = Math.min(RECONNECT_MAX_MS, 1000 * 2 ** attempts++)
        reconnectTimer = window.setTimeout(connect, backoff + Math.random() * 500)
      }
    }

    const heartbeat = window.setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN || document.visibilityState !== 'visible')
        return
      if (awaitingPong) {
        ws.close() // silent corpse — onclose schedules the reconnect
        return
      }
      awaitingPong = true
      ws.send('ping')
    }, HEARTBEAT_MS)

    const wake = () => {
      if (document.visibilityState !== 'visible') return
      attempts = 0
      clearTimeout(reconnectTimer)
      connect()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    connect()

    return () => {
      gone = true
      clearInterval(heartbeat)
      clearTimeout(reconnectTimer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      liveRef.current = false
      ws?.close()
    }
  }, [code, token, adopt])

  // Fallback poll while visible, not live, and it's not our move; refresh
  // immediately on becoming visible again (the socket takes a beat to open).
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (liveRef.current) return
      const current = viewRef.current
      if (current && myMove(current)) return
      void refresh()
    }
    const interval = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refresh])

  // Toasts clear themselves.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const send = useCallback(
    async (move: ClientMove): Promise<boolean> => {
      setBusy(true)
      const r = await api.move(code, token, move)
      setBusy(false)
      if (!r.ok) {
        setError(r.error)
        // Our picture may be stale (e.g. opponent moved first) — resync.
        if (!('offline' in r)) void refresh()
        return false
      }
      setError(null)
      adopt(r.view, true)
      return true
    },
    [code, token, adopt, refresh],
  )

  const rematch = useCallback(async () => {
    setBusy(true)
    const r = await api.rematch(code, token)
    setBusy(false)
    if (!r.ok) setError(r.error)
    else adopt(r.view, true)
  }, [code, token, adopt])

  return {
    view,
    error,
    toast,
    stamp,
    busy,
    lost,
    live,
    send,
    rematch,
    clearError: () => setError(null),
    clearStamp: () => setStamp(null),
  }
}
