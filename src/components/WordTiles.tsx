import { tileClass, type Side } from './tiles'

interface WordTilesProps {
  word: string
  side: Side
  /** Head letters tinted — the letters this word borrowed from the previous. */
  headTint?: number
  /** Tail letters tinted — the letters the next word gripped. */
  tailTint?: number
  small?: boolean
}

/** One word as chiclet tiles with the tint-joint rule applied. */
export function WordTiles({ word, side, headTint = 0, tailTint = 0, small }: WordTilesProps) {
  return (
    <span className={small ? 'flex gap-[2px]' : 'flex gap-[3px]'}>
      {word.split('').map((ch, j) => {
        const tinted = j < headTint || j >= word.length - tailTint
        return (
          <span key={j} className={tileClass(side, tinted, small)}>
            {ch}
          </span>
        )
      })}
    </span>
  )
}
