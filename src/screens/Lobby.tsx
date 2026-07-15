// The game lobby: every match this device holds, listed by the friend's name
// and split into what needs you now (your move), what's on them, invites still
// waiting for a friend, and finished games. Paints instantly from the cached
// summaries, then refreshes over the network — so it opens fast and survives a
// flaky-wifi open. The 4-letter code only surfaces on a pending invite, where
// it's the thing you actually share.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { InviteSheet } from '../components/InviteSheet'
import { ShareIcon } from '../components/icons'
import { tileClass } from '../components/tiles'
import type { PlayerId } from '../game'
import { api } from '../lib/api'
import type { MatchSummary } from '../lib/protocol'
import { timeAgo } from '../lib/timeAgo'
import { duelBucket, soloBucket } from '../multi/lobby'
import {
  listSeats,
  loadLobbyCache,
  removeMatchAuth,
  saveLobbyCache,
} from '../multi/storage'
import { loadSoloSave, type SoloSave } from '../solo/useSoloMatch'

interface LobbyProps {
  onBack: () => void
  onOpenMatch: (code: string) => void
  onResumeSolo: (save: SoloSave) => void
  onNewDuel: () => void
  onJoinCode: () => void
}

const PILL = 'text-[12px] font-extrabold rounded-full px-2.5 py-1 whitespace-nowrap'
const yourTurnPill = (
  <span className={`${PILL} bg-p1 text-white shadow-[0_3px_0_var(--color-p1-lip)]`}>Your turn</span>
)
const theirTurnPill = <span className={`${PILL} bg-board text-dim`}>Their turn</span>
function resultPill(winner: PlayerId | null, you: PlayerId): ReactNode {
  if (winner === you)
    return <span className={`${PILL} bg-[#E9F7EC] text-[#2A9D4E]`}>You won</span>
  if (winner) return <span className={`${PILL} bg-board text-dim`}>They won</span>
  return <span className={`${PILL} bg-board text-dim`}>Ended</span>
}

/** The two scores, colored by side: you are always indigo, the friend coral. */
function Score({ you, them }: { you: number; them: number }) {
  return (
    <span className="font-bold text-[13px]">
      <span className="text-p1-lip">{you}</span>
      <span className="text-dim"> – </span>
      <span className="text-p2-lip">{them}</span>
    </span>
  )
}

function OpponentRow({
  name,
  live,
  you,
  them,
  pill,
  ago,
  onClick,
}: {
  name: string
  live: boolean
  you: number
  them: number
  pill: ReactNode
  ago?: string
  onClick: () => void
}) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?'
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl shadow-[0_4px_0_#E2DDD3] active:translate-y-0.5 px-3.5 py-3 flex items-center gap-3"
    >
      <span className="w-11 h-11 shrink-0 rounded-xl bg-p2 text-white font-extrabold text-lg flex items-center justify-center shadow-[0_3px_0_var(--color-p2-lip)]">
        {initial}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="font-extrabold text-ink-strong truncate">{name}</span>
          {live && (
            <span
              className="w-2 h-2 rounded-full bg-[#34C759] shrink-0"
              aria-label="online now"
            />
          )}
        </span>
        <span className="block mt-0.5">
          <Score you={you} them={them} />
        </span>
      </span>
      <span className="shrink-0 flex flex-col items-end gap-1">
        {pill}
        {ago && <span className="text-[11px] font-bold text-dim">{ago}</span>}
      </span>
    </button>
  )
}

function PendingRow({
  s,
  onOpen,
  onShare,
}: {
  s: MatchSummary
  onOpen: () => void
  onShare: () => void
}) {
  const word = s.openingWord?.toUpperCase() ?? null
  return (
    <div className="bg-white rounded-2xl shadow-[0_4px_0_#E2DDD3] px-3.5 py-3 flex items-center gap-3">
      <button
        onClick={onOpen}
        className="flex items-center gap-3 flex-1 min-w-0 text-left active:translate-y-0.5"
      >
        <span className="flex gap-[3px] shrink-0">
          {s.code.split('').map((ch, i) => (
            <span key={i} className={tileClass('you', true, true)}>
              {ch}
            </span>
          ))}
        </span>
        <span className="min-w-0">
          <span className="block font-extrabold text-ink-strong truncate">Waiting to join</span>
          <span className="block mt-0.5 text-[12px] font-semibold text-dim truncate">
            {word ? (
              <>
                Opened with <b className="text-ink">{word}</b>
              </>
            ) : (
              'Invite a friend to take the seat'
            )}
          </span>
        </span>
      </button>
      <button
        onClick={onShare}
        className="shrink-0 h-10 px-3.5 rounded-xl bg-p2 text-white font-extrabold text-[13px] shadow-[0_3px_0_var(--color-p2-lip)] active:translate-y-0.5 flex items-center gap-1.5"
      >
        <ShareIcon className="w-4 h-4 text-white" /> Share
      </button>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[12px] font-extrabold tracking-wider uppercase text-dim">{title}</span>
        <span className="text-[12px] font-extrabold text-dim">{count}</span>
      </div>
      {children}
    </section>
  )
}

export function Lobby({ onBack, onOpenMatch, onResumeSolo, onNewDuel, onJoinCode }: LobbyProps) {
  const [summaries, setSummaries] = useState<MatchSummary[]>(() => loadLobbyCache())
  const [solo] = useState<SoloSave | null>(() => loadSoloSave())
  const [showFinished, setShowFinished] = useState(false)
  const [sharing, setSharing] = useState<MatchSummary | null>(null)
  // Only surface a spinner on a truly empty first open — otherwise the cached
  // list is already on screen and a refresh happens quietly behind it.
  const [loading, setLoading] = useState(() => loadLobbyCache().length === 0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const seats = listSeats()
    if (seats.length === 0) {
      setLoading(false)
      return
    }
    void (async () => {
      const r = await api.matchesSummary(seats.map((s) => ({ code: s.code, token: s.auth.token })))
      if (!mounted.current) return
      setLoading(false)
      if (!r.ok) return // offline: keep showing the cached list
      r.gone.forEach(removeMatchAuth) // prune matches deleted after 60 days
      setSummaries(r.summaries)
      saveLobbyCache(r.summaries)
    })()
    return () => {
      mounted.current = false
    }
  }, [])

  const byRecent = (a: MatchSummary, b: MatchSummary) => (b.lastMoveAt ?? 0) - (a.lastMoveAt ?? 0)
  const yourMove = summaries.filter((s) => duelBucket(s) === 'yourMove').sort(byRecent)
  const theirMove = summaries.filter((s) => duelBucket(s) === 'theirMove').sort(byRecent)
  const pending = summaries.filter((s) => duelBucket(s) === 'pending').sort(byRecent)
  const finished = summaries.filter((s) => duelBucket(s) === 'finished').sort(byRecent)
  const soloB = solo ? soloBucket(solo) : null

  const summaryRow = (s: MatchSummary) => {
    const b = duelBucket(s)
    const pill =
      b === 'finished' ? resultPill(s.winner, s.you) : b === 'yourMove' ? yourTurnPill : theirTurnPill
    return (
      <OpponentRow
        key={s.code}
        name={s.opponentName ?? 'Your friend'}
        live={s.opponentPresent && b !== 'finished'}
        you={s.yourScore}
        them={s.opponentScore}
        pill={pill}
        ago={s.lastMoveAt ? timeAgo(s.lastMoveAt) : undefined}
        onClick={() => onOpenMatch(s.code)}
      />
    )
  }

  const soloRow = (save: SoloSave) => {
    const st = save.state
    const b = soloBucket(save)
    const pill =
      b === 'finished' ? resultPill(st.winner, 'p1') : b === 'yourMove' ? yourTurnPill : theirTurnPill
    return (
      <OpponentRow
        key="solo"
        name={st.players.p2.name}
        live={false}
        you={st.players.p1.gold}
        them={st.players.p2.gold}
        pill={pill}
        onClick={() => onResumeSolo(save)}
      />
    )
  }

  const yourMoveCount = yourMove.length + (soloB === 'yourMove' ? 1 : 0)
  const theirMoveCount = theirMove.length + (soloB === 'theirMove' ? 1 : 0)
  const finishedCount = finished.length + (soloB === 'finished' ? 1 : 0)
  const empty = summaries.length === 0 && !solo

  return (
    <div className="min-h-dvh bg-board flex flex-col">
      <div className="px-5 pt-7 pb-2 max-w-[430px] w-full mx-auto">
        <button onClick={onBack} className="h-11 -ml-2 px-2 font-extrabold text-[13px] text-dim">
          ← Back
        </button>
        <h1 className="text-2xl font-extrabold text-ink-strong mt-1">Your games</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8 max-w-[430px] w-full mx-auto flex flex-col gap-6 pt-2">
        {empty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-20">
            <p className="font-extrabold text-ink-strong text-lg">No games yet</p>
            <p className="font-semibold text-dim text-[13.5px] max-w-[15rem]">
              Duel a friend or play a llama, and your games will gather here.
            </p>
          </div>
        ) : (
          <>
            {loading && summaries.length === 0 && (
              <p className="text-center font-extrabold text-dim text-[13px] py-8 animate-pulse motion-reduce:animate-none">
                Gathering your games…
              </p>
            )}

            {yourMoveCount > 0 && (
              <Section title="Your move" count={yourMoveCount}>
                {yourMove.map(summaryRow)}
                {soloB === 'yourMove' && solo && soloRow(solo)}
              </Section>
            )}

            {theirMoveCount > 0 && (
              <Section title="Their move" count={theirMoveCount}>
                {theirMove.map(summaryRow)}
                {soloB === 'theirMove' && solo && soloRow(solo)}
              </Section>
            )}

            {pending.length > 0 && (
              <Section title="Waiting for a friend" count={pending.length}>
                {pending.map((s) => (
                  <PendingRow
                    key={s.code}
                    s={s}
                    onOpen={() => onOpenMatch(s.code)}
                    onShare={() => setSharing(s)}
                  />
                ))}
              </Section>
            )}

            {finishedCount > 0 && (
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => setShowFinished((v) => !v)}
                  className="self-center h-11 px-4 font-extrabold text-[13px] text-dim"
                >
                  {showFinished ? 'Hide' : 'Finished games'} ({finishedCount}) {showFinished ? '▲' : '▸'}
                </button>
                {showFinished && (
                  <div className="flex flex-col gap-2.5">
                    {finished.map(summaryRow)}
                    {soloB === 'finished' && solo && soloRow(solo)}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* The lobby is also the launch pad — start a new game right here. */}
        <div className="flex flex-col gap-3 mt-auto pt-4">
          <button
            onClick={onNewDuel}
            className="h-14 rounded-2xl font-extrabold text-lg bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5"
          >
            Duel a friend
          </button>
          <button
            onClick={onJoinCode}
            className="h-12 rounded-2xl font-extrabold bg-white text-ink shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5"
          >
            Join with a code
          </button>
        </div>
      </div>

      {sharing && (
        <InviteSheet
          code={sharing.code}
          openingWord={sharing.openingWord}
          onClose={() => setSharing(null)}
        />
      )}
    </div>
  )
}
