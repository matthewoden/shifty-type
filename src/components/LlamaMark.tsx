// The llama's mark: the double-L monogram every llama name starts with
// (Lloyd, Llois, Llarry), drawn as two coral tiles. One definition for every
// place a llama signs something: the Home tutorial card, the tutorial
// doorstep, and — at `xs` coach-bubble scale, where a full tile would crowd
// the board — the lesson bubbles.

import { tileClass } from './tiles'

const XS_CHIP =
  'w-[15px] h-[15px] rounded bg-p2 text-white text-[10px] font-extrabold flex items-center justify-center shadow-[0_2px_0_var(--color-p2-lip)]'

export function LlamaMark({ size = 'sm' }: { size?: 'sm' | 'xs' }) {
  const chip = size === 'xs' ? XS_CHIP : tileClass('them', false, true)
  // The lip shadow hangs below the tile's box, so a plain items-center row
  // seats the mark visually low. A bottom margin the height of the lip makes
  // the centered margin box match the visual block (tile + lip).
  const seat = size === 'xs' ? 'mb-[2px]' : 'mb-[3px]'
  return (
    <span className={`flex gap-[2px] ${seat}`} aria-hidden>
      <span className={chip}>L</span>
      <span className={chip}>L</span>
    </span>
  )
}
