import { tileClass } from './tiles'

/**
 * The name plays itself in, as a real move: SHIFTY pops in solid, TYPE types
 * itself in tile by tile — the same fill-pop the ghost seeds use — and SHIFTY's
 * tail TY spends to tint as the grip lands. Shared by Home and the invite
 * landing. See index.css logo-pop / logo-spend / logo-typein (reduced motion
 * holds the finished mark).
 */
export function Logo() {
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
