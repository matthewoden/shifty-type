import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { tileClass, type Side } from './tiles'

interface WordTilesProps {
  word: string
  side: Side
  /** Head letters tinted — the letters this word borrowed from the previous. */
  headTint?: number
  /** Tail letters tinted — the letters the next word gripped. */
  tailTint?: number
  small?: boolean
  /** When set, the tiles land one after another as if being typed — the
   *  unseen-word reveal. Value = ms delay before the first tile; each next
   *  tile follows 60ms behind. */
  typeinFrom?: number
  /**
   * Fold a long word onto more lines. ONLY for width-constrained surfaces
   * (the flat ledger) — never on the rail, where a row placed near the
   * canvas edge would shrink-to-fit and fold every tile onto its own line.
   * The y-gap clears the tiles' lip shadow.
   */
  wrap?: boolean
}

/** The rail's edge fades — each edge only fades while there is actually
 *  content hidden beyond it, so a resting row starts flush and aligned. */
function railMask(fadeLeft: boolean, fadeRight: boolean): string | undefined {
  if (!fadeLeft && !fadeRight) return undefined
  const left = fadeLeft ? 'transparent, #000 18px' : '#000'
  const right = fadeRight ? '#000 calc(100% - 18px), transparent' : '#000'
  return `linear-gradient(to right, ${left}, ${right})`
}

interface TileRailProps {
  word: string
  side: Side
  headTint?: number
  tailTint?: number
  small?: boolean
  /** One advertise-the-swipe glide shortly after mount (the share card). */
  peek?: boolean
  /** Short words sit at the container's start or center; long ones ride. */
  align?: 'start' | 'center'
  className?: string
}

/**
 * One line of tiles that rides sideways when the word outgrows its card —
 * the board's camera gesture in miniature (scoreboard rows, the invite's
 * "you opened with" card, the detail card, the challenge sheet). Words that
 * fit render exactly as a plain row: no fades, no scroll. The flat ledger
 * (reduced motion) folds with WordTiles instead.
 */
export function TileRail({
  word,
  side,
  headTint = 0,
  tailTint = 0,
  small,
  peek,
  align = 'start',
  className = '',
}: TileRailProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)
  const [edge, setEdge] = useState({ start: true, end: true })
  const measure = () => {
    const el = ref.current
    if (!el) return
    setOver(el.scrollWidth > el.clientWidth + 1)
    setEdge({
      start: el.scrollLeft < 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, [word, small])
  useEffect(() => {
    if (!peek || !over) return
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const out = window.setTimeout(() => el.scrollTo({ left: 110, behavior: 'smooth' }), 1200)
    const back = window.setTimeout(() => el.scrollTo({ left: 0, behavior: 'smooth' }), 2300)
    return () => {
      clearTimeout(out)
      clearTimeout(back)
    }
  }, [peek, over])
  const mask = over ? railMask(!edge.start, !edge.end) : undefined
  return (
    <div
      ref={ref}
      onScroll={measure}
      className={`overflow-x-auto no-native-scrollbar ${className}`}
      style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
    >
      {/* The scroll container clips on both axes, and the tiles' lip shadow
          hangs 4px below their box — the bottom padding keeps it un-sheared.
          No leading padding on 'start' rails: a resting scoreboard row must
          line up with its short neighbors (the left fade only appears once
          scrolled, so the head tile is never dimmed at rest). */}
      <div
        className={`w-max pt-0.5 ${small ? 'pb-1' : 'pb-1.5'} ${
          over ? (align === 'center' ? 'px-3' : '') : align === 'center' ? 'mx-auto' : ''
        }`}
      >
        <WordTiles word={word} side={side} headTint={headTint} tailTint={tailTint} small={small} />
      </div>
    </div>
  )
}

/** One word as chiclet tiles with the tint-joint rule applied. */
export function WordTiles({ word, side, headTint = 0, tailTint = 0, small, typeinFrom, wrap }: WordTilesProps) {
  const layout = wrap
    ? small
      ? 'flex flex-wrap gap-x-[2px] gap-y-1.5'
      : 'flex flex-wrap gap-x-[3px] gap-y-2'
    : small
      ? 'flex gap-[2px]'
      : 'flex gap-[3px]'
  return (
    <span className={layout}>
      {word.split('').map((ch, j) => {
        const tinted = j < headTint || j >= word.length - tailTint
        return (
          <span
            key={j}
            className={`${tileClass(side, tinted, small)}${typeinFrom === undefined ? '' : ' typein-tile'}`}
            style={typeinFrom === undefined ? undefined : { animationDelay: `${typeinFrom + j * 60}ms` }}
          >
            {ch}
          </span>
        )
      })}
    </span>
  )
}
