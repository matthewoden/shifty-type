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
}

/** One word as chiclet tiles with the tint-joint rule applied. */
export function WordTiles({ word, side, headTint = 0, tailTint = 0, small, typeinFrom }: WordTilesProps) {
  return (
    <span className={small ? 'flex gap-[2px]' : 'flex gap-[3px]'}>
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
