import { useReducer } from 'react'
import { InstallBadge } from '../components/InstallBadge'
import { GearIcon } from '../components/icons'
import { LlamaMark } from '../components/LlamaMark'
import { Logo } from '../components/Logo'
import { PasteBadge } from '../components/PasteBadge'
import { Button } from '../components/ui/Button'
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
  onSettings: () => void
  /** PasteBadge restores seats then opens the match it just recovered. */
  onResumeDuel: (code: string) => void
}

export function Home({
  onSolo,
  onDuel,
  onJoinCode,
  onTutorial,
  onOpenGames,
  onSettings,
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
    <div className="relative min-h-dvh bg-board flex flex-col items-center justify-start gap-6 px-6 pt-11 pb-8">
      <button
        onClick={onSettings}
        aria-label="Settings"
        className="absolute top-2.5 right-2.5 w-11 h-11 flex items-center justify-center text-dim active:translate-y-0.5"
      >
        <GearIcon className="w-6 h-6" />
      </button>
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
            <LlamaMark />
            <span className="flex-1 font-extrabold text-small text-ink-strong leading-snug">
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
              <span className="block font-extrabold text-base text-ink-strong">Your games</span>
              <span className="block font-bold text-caption text-dim">{gamesSubtitle}</span>
            </span>
            {needsYou > 0 && (
              <span className="min-w-6 h-6 px-1.5 rounded-full bg-p2 text-white font-extrabold text-ui flex items-center justify-center shadow-[0_2px_0_var(--color-p2-lip)]">
                {needsYou}
              </span>
            )}
            <span className="text-lg font-extrabold text-dim">›</span>
          </button>
        )}
        <Button variant="cta" accent="p2" size="lg" onClick={onDuel}>
          Challenge a friend
        </Button>
        <Button variant="cta" accent="p1" size="lg" onClick={onSolo}>
          Play against a local llama
        </Button>
        <Button variant="cta" accent="white" size="sm" onClick={onJoinCode}>
          Join with a code
        </Button>
        <div className="flex justify-center gap-1 items-center">
          <Button variant="text" size="sm" onClick={onHowTo}>
            How to play
          </Button>
          {isTutorialDone() && (
            <>
              <span className="text-dim text-ui font-extrabold">·</span>
              <Button variant="text" size="sm" onClick={onTutorial}>
                Tutorial
              </Button>
            </>
          )}
        </div>
        <PasteBadge onOpenMatch={onResumeDuel} onRestored={rerender} />
        <InstallBadge />
      </div>
    </div>
  )
}
