import { useReducer } from 'react'
import { InstallBadge } from '../components/InstallBadge'
import { PasteBadge } from '../components/PasteBadge'
import { tileClass } from '../components/tiles'
import { needsYouCount } from '../multi/lobby'
import { listSeats, loadLobbyCache } from '../multi/storage'
import { isTutorialDone } from '../solo/tutorial'
import { loadSoloSave } from '../solo/useSoloMatch'

interface HomeProps {
  onSolo: () => void
  onHowTo: () => void
  onDuel: () => void
  onJoinCode: () => void
  onTutorial: () => void
  onOpenGames: () => void
  /** PasteBadge restores seats then opens the match it just recovered. */
  onResumeDuel: (code: string) => void
}

/**
 * The name plays itself in, as a real move: SHIFTY pops in solid, TYPE
 * types itself in tile by tile — the same fill-pop the ghost seeds use —
 * and SHIFTY's tail TY spends to tint as the grip lands.
 */
function Logo() {
  return (
    <div className="flex flex-col items-start gap-2" aria-label="Shifty Type">
      <span className="flex gap-[3px]">
        {['s', 'h', 'i', 'f', 't', 'y'].map((ch, i) => (
          <span
            key={i}
            className={`${tileClass('you', i >= 4)} logo-pop ${i >= 4 ? 'logo-spend' : ''}`}
            style={{ animationDelay: i >= 4 ? `${i * 80}ms, 1050ms` : `${i * 80}ms` }}
          >
            {ch}
          </span>
        ))}
      </span>
      <span className="flex gap-[3px]" style={{ marginLeft: 4 * 26 }}>
        {['t', 'y', 'p', 'e'].map((ch, i) => (
          <span
            key={i}
            className={`${tileClass('them', i < 2)} logo-typein`}
            style={{ animationDelay: `${950 + i * 80}ms` }}
          >
            {ch}
          </span>
        ))}
      </span>
    </div>
  )
}

export function Home({
  onSolo,
  onDuel,
  onJoinCode,
  onTutorial,
  onOpenGames,
  onResumeDuel,
  onHowTo,
}: HomeProps) {
  // Home reads localStorage at render; a seat-link paste changes it under
  // our feet, so the badge pokes us to re-read (the games button appears).
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const soloSave = loadSoloSave()
  const gameCount = listSeats().length + (soloSave ? 1 : 0)
  // How many need the player right now — read from the cached lobby summaries,
  // so it's instant and offline. Absent/stale until the lobby is opened once.
  const needsYou = needsYouCount(loadLobbyCache(), soloSave)
  const gamesSubtitle =
    needsYou > 0 ? `${needsYou} waiting on you` : `${gameCount} game${gameCount === 1 ? '' : 's'}`
  return (
    <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-4">
        <Logo />
        <p className="text-ink font-semibold max-w-2xs text-center">
          It's your word against theirs.
        </p>
      </div>
      <div className="flex flex-col gap-3.5 w-full max-w-xs">
        {!isTutorialDone() && (
          <button
            onClick={onTutorial}
            className="bg-white rounded-2xl px-4 py-3.5 shadow-[0_4px_0_#E2DDD3] active:translate-y-0.5 flex items-center gap-3 text-left"
          >
            <span className="flex gap-[2px]">
              <span className="w-5 h-5 rounded-[5px] bg-p2 text-white text-[13px] font-extrabold flex items-center justify-center shadow-[0_3px_0_var(--color-p2-lip)]">
                L
              </span>
              <span className="w-5 h-5 rounded-[5px] bg-p2 text-white text-[13px] font-extrabold flex items-center justify-center shadow-[0_3px_0_var(--color-p2-lip)]">
                L
              </span>
            </span>
            <span className="flex-1 font-extrabold text-[14px] text-ink-strong leading-snug">
              New here? Try the tutorial!
            </span>
            <span className="text-lg font-extrabold text-dim">›</span>
          </button>
        )}
        {gameCount > 0 && (
          <button
            onClick={onOpenGames}
            className="h-[60px] rounded-2xl bg-white shadow-[0_4px_0_#E2DDD3] active:translate-y-0.5 flex items-center gap-3 px-4 text-left"
          >
            <span className="w-[34px] h-[34px] rounded-[10px] bg-board flex items-center justify-center shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-p1 shadow-[0_2px_0_var(--color-p1-lip)]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-extrabold text-[16px] text-ink-strong">Your games</span>
              <span className="block font-bold text-[12px] text-dim">{gamesSubtitle}</span>
            </span>
            {needsYou > 0 && (
              <span className="min-w-6 h-6 px-1.5 rounded-full bg-p2 text-white font-extrabold text-[13px] flex items-center justify-center shadow-[0_2px_0_var(--color-p2-lip)]">
                {needsYou}
              </span>
            )}
            <span className="text-lg font-extrabold text-dim">›</span>
          </button>
        )}
        <button
          onClick={onDuel}
          className="h-14 rounded-2xl font-extrabold text-lg bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)] active:translate-y-0.5"
        >
          Duel a friend
        </button>
        <button
          onClick={onSolo}
          className="h-14 rounded-2xl font-extrabold text-lg bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] active:translate-y-0.5"
        >
          Play against a local llama
        </button>
        <button
          onClick={onJoinCode}
          className="h-12 rounded-2xl font-extrabold bg-white text-ink shadow-[0_3px_0_#E2DDD3] active:translate-y-0.5"
        >
          Join with a code
        </button>
        <div className="flex justify-center gap-1 items-center">
          <button onClick={onHowTo} className="h-11 px-2 font-extrabold text-[13px] text-dim">
            How to play
          </button>
          {isTutorialDone() && (
            <>
              <span className="text-dim text-[13px] font-extrabold">·</span>
              <button onClick={onTutorial} className="h-11 px-2 font-extrabold text-[13px] text-dim">
                Tutorial
              </button>
            </>
          )}
        </div>
        <PasteBadge onOpenMatch={onResumeDuel} onRestored={rerender} />
        <InstallBadge />
      </div>
    </div>
  )
}
