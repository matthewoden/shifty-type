// The tutorial doorstep: FIRST STEPS plays itself in like the home logo
// (SoloSetup's tighter clock), and Lloyd introduces himself on one line.

import { LlamaMark } from '../components/LlamaMark'
import { TileLockup } from '../components/TileLockup'
import { Button } from '../components/ui/Button'

export function TutorialWelcome({
  onPlay,
  onRules,
  onBack,
}: {
  onPlay: () => void
  onRules: () => void
  onBack: () => void
}) {
  return (
    <div className="h-dvh bg-board flex flex-col overflow-hidden">
      <div className="flex items-center px-3.5 pt-2 pb-2.5">
        <Button variant="text" size="sm" onClick={onBack}>
          ← Home
        </Button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 text-center">
        <TileLockup top="first" bottom="steps" pace="quick" kicker="Take your" />
        <div className="max-w-[290px] setup-fade">
          <div className="flex items-center justify-center gap-2">
            <LlamaMark />
            <span className="font-extrabold text-status text-ink-strong">
              I'm Lloyd, the Tutorial Llama.
            </span>
          </div>
          <p className="font-semibold text-small text-ink leading-relaxed mt-2.5">
            One real game, me explaining as we go. You'll have the hang of it by your second word.
            I'll go first.
          </p>
        </div>
        <div className="flex flex-col gap-3.5 w-full max-w-[250px] setup-fade">
          <Button variant="cta" accent="p1" size="lg" onClick={onPlay}>
            Let's play
          </Button>
          <Button variant="text" size="sm" onClick={onRules}>
            I'd rather just read the rules
          </Button>
        </div>
      </div>
    </div>
  )
}
