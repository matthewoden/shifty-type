// The tutorial doorstep: FIRST STEPS plays itself in like the home logo
// (SoloSetup's tighter clock), and Lloyd introduces himself on one line.

import { tileClass } from '../components/tiles'

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
        <button onClick={onBack} className="h-11 px-2 font-extrabold text-[13px] text-dim">
          ← Home
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="flex flex-col items-center gap-2.5">
          <p className="text-dim font-extrabold text-[11px] uppercase tracking-[2px]">Take your</p>
          <div className="flex flex-col items-start gap-1.5" aria-label="First Steps">
            <span className="flex gap-[3px]">
              {['f', 'i', 'r', 's', 't'].map((ch, i) => (
                <span
                  key={i}
                  className={`${tileClass('you', i >= 3)} logo-pop ${i >= 3 ? 'logo-spend' : ''}`}
                  style={{ animationDelay: i >= 3 ? `${i * 60}ms, 520ms` : `${i * 60}ms` }}
                >
                  {ch}
                </span>
              ))}
            </span>
            <span className="flex gap-[3px]" style={{ marginLeft: 78 }}>
              {['s', 't', 'e', 'p', 's'].map((ch, i) => (
                <span
                  key={i}
                  className={`${tileClass('them', i < 2)} logo-typein`}
                  style={{ animationDelay: `${420 + i * 60}ms` }}
                >
                  {ch}
                </span>
              ))}
            </span>
          </div>
        </div>
        <div className="max-w-[290px] setup-fade">
          <div className="flex items-center justify-center gap-2">
            <span className="flex gap-[2px]">
              <span className={tileClass('them', false, true)}>L</span>
              <span className={tileClass('them', false, true)}>L</span>
            </span>
            <span className="font-extrabold text-[15px] text-ink-strong">
              I'm Lloyd, the Tutorial Llama.
            </span>
          </div>
          <p className="font-semibold text-[14.5px] text-ink leading-relaxed mt-2.5">
            One real game, me explaining as we go. You'll have the hang of it by your second word.
            I'll go first.
          </p>
        </div>
        <div className="flex flex-col gap-3.5 w-full max-w-[250px] setup-fade">
          <button
            onClick={onPlay}
            className="h-14 rounded-2xl font-extrabold text-lg bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] active:translate-y-0.5"
          >
            Let's play
          </button>
          <button onClick={onRules} className="h-11 font-extrabold text-[13px] text-dim">
            I'd rather just read the rules
          </button>
        </div>
      </div>
    </div>
  )
}
