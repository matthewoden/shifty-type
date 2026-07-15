// Lloyd introduces himself before the scripted match.

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
        <span className="flex gap-[3px]">
          <span className={`${tileClass('them', false)} !w-[34px] !h-[46px] !text-[26px]`}>L</span>
          <span className={`${tileClass('them', false)} !w-[34px] !h-[46px] !text-[26px]`}>L</span>
        </span>
        <div className="max-w-[290px]">
          <h1 className="text-xl font-extrabold text-ink-strong leading-snug">
            Hey there! I'm Lloyd,
            <br />
            the Tutorial Llama.
          </h1>
          <p className="font-semibold text-[14.5px] text-ink leading-relaxed mt-2.5">
            We'll play a real game and I'll explain as we go. Two minutes, no reading. I'll go
            first.
          </p>
        </div>
        <div className="flex flex-col gap-3.5 w-full max-w-[250px]">
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
