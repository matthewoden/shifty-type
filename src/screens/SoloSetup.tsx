import type { Difficulty } from '../game'
import { tileClass } from '../components/tiles'

const OPTIONS: Array<{ difficulty: Difficulty; label: string; blurb: string }> = [
  { difficulty: 'easy', label: 'Lloyd · Mellow', blurb: 'New llama in town, trusting.' },
  { difficulty: 'medium', label: 'Llois · Curious', blurb: "Clever, doesn't let nonsense slide." },
  {
    difficulty: 'hard',
    label: 'Llarry · Unhinged',
    blurb: 'Big vocabulary. Not afraid to bluff.',
  },
]

interface SoloSetupProps {
  onStart: (difficulty: Difficulty) => void
  onBack: () => void
}

/**
 * The header plays itself in like the home logo, on a tighter clock: SWELL
 * pops in solid, LLAMAS types itself in, SWELL's tail LL spends as the grip
 * lands, and the rest of the screen fades up while the tiles still land.
 */
export function SoloSetup({ onStart, onBack }: SoloSetupProps) {
  return (
    <div className="min-h-dvh bg-board flex flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2.5">
        <p className="text-dim font-extrabold text-[11px] uppercase tracking-[2px]">Meet these</p>
        <div className="flex flex-col items-start gap-1.5" aria-label="Swell Llamas">
          <span className="flex gap-[3px]">
            {['s', 'w', 'e', 'l', 'l'].map((ch, i) => (
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
            {['l', 'l', 'a', 'm', 'a', 's'].map((ch, i) => (
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
        <p className="text-ink font-bold text-[15px] mt-6 setup-fade">Pick a llama to play against.</p>
      </div>
      <div className="flex flex-col gap-3.5 w-full max-w-xs setup-fade">
        {OPTIONS.map((o) => (
          <button
            key={o.difficulty}
            onClick={() => onStart(o.difficulty)}
            className="text-left bg-white rounded-2xl px-5 py-4 shadow-[0_4px_0_#E2DDD3] active:translate-y-0.5 active:shadow-[0_2px_0_#E2DDD3]"
          >
            <span className="font-extrabold text-lg text-ink-strong">{o.label}</span>
            <span className="block text-[13px] font-semibold text-ink">{o.blurb}</span>
          </button>
        ))}
      </div>
      <button onClick={onBack} className="h-11 px-4 font-extrabold text-dim setup-fade">
        ← Back
      </button>
    </div>
  )
}
