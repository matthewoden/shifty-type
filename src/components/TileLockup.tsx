// The type-in lockup: a two-word title that plays itself in as a real move.
// The top word pops in solid (indigo), the bottom word types itself in
// (coral), and the top word's tail spends to tint as the grip lands — the
// same fill-pop the ghost seeds use. See index.css logo-pop / logo-spend /
// logo-typein (reduced motion holds the finished mark).
//
// The pair must be a legal move — grip ≥ 2 — and the grip and second-line
// indent are computed, not hand-set, so a new lockup can't quietly break the
// rule or drift off the tile grid.

import { overlapOf } from '../game'
import { TILE_STEP, tileClass } from './tiles'

/** 'home' is the logo's unhurried clock; 'quick' is the header clock screens
 *  use so the rest of the page can fade up while tiles still land. */
const PACE = {
  home: { step: 80, typein: 950, spend: 1050, gap: 'gap-2' },
  quick: { step: 60, typein: 420, spend: 520, gap: 'gap-1.5' },
} as const

interface TileLockupProps {
  top: string
  bottom: string
  pace?: keyof typeof PACE
  /** The little uppercase lead-in above the mark ("Meet these", "Take your"). */
  kicker?: string
  /** Defaults to the title-cased pair ("Shifty Type"). */
  label?: string
}

const cap = (w: string) => w[0].toUpperCase() + w.slice(1)

export function TileLockup({ top, bottom, pace = 'home', kicker, label }: TileLockupProps) {
  const grip = overlapOf(top, bottom)
  const c = PACE[pace]
  const mark = (
    <div
      className={`flex flex-col items-start ${c.gap}`}
      aria-label={label ?? `${cap(top)} ${cap(bottom)}`}
    >
      <span className="flex gap-[3px]">
        {top.split('').map((ch, i) => {
          const tail = i >= top.length - grip
          return (
            <span
              key={i}
              className={`${tileClass('you', tail)} logo-pop ${tail ? 'logo-spend' : ''}`}
              style={{ animationDelay: tail ? `${i * c.step}ms, ${c.spend}ms` : `${i * c.step}ms` }}
            >
              {ch}
            </span>
          )
        })}
      </span>
      <span className="flex gap-[3px]" style={{ marginLeft: (top.length - grip) * TILE_STEP }}>
        {bottom.split('').map((ch, i) => (
          <span
            key={i}
            className={`${tileClass('them', i < grip)} logo-typein`}
            style={{ animationDelay: `${c.typein + i * c.step}ms` }}
          >
            {ch}
          </span>
        ))}
      </span>
    </div>
  )
  if (!kicker) return mark
  return (
    <div className="flex flex-col items-center gap-2.5">
      <p className="text-dim font-extrabold text-label uppercase tracking-[2px]">{kicker}</p>
      {mark}
    </div>
  )
}
