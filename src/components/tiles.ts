import type { PlayerId } from '../game'

/**
 * Colors follow the viewer, not the slot: you are always indigo on your own
 * device, the opponent always coral — whichever server slot you hold.
 */
export type Side = 'you' | 'them'

export function sideOf(owner: PlayerId, you: PlayerId): Side {
  return owner === you ? 'you' : 'them'
}

const TILE_MD =
  'w-[23px] h-8 shrink-0 rounded-[7px] flex items-center justify-center font-extrabold text-lg uppercase select-none'
const TILE_SM =
  'w-[17px] h-6 shrink-0 rounded-[5px] flex items-center justify-center font-extrabold text-[13px] uppercase select-none'

/** Chiclet tile classes: solid = unspent letters, tint = joint letters. */
export function tileClass(side: Side, tinted: boolean, small = false): string {
  // Tailwind needs literal class strings, so the four color variants exist
  // twice (md lip 4px, sm lip 3px).
  if (small) {
    if (side === 'you') {
      return tinted
        ? `${TILE_SM} bg-p1-tint text-p1-tint-ink shadow-[0_3px_0_var(--color-p1-tint-lip)]`
        : `${TILE_SM} bg-p1 text-white shadow-[0_3px_0_var(--color-p1-lip)]`
    }
    return tinted
      ? `${TILE_SM} bg-p2-tint text-p2-tint-ink shadow-[0_3px_0_var(--color-p2-tint-lip)]`
      : `${TILE_SM} bg-p2 text-white shadow-[0_3px_0_var(--color-p2-lip)]`
  }
  if (side === 'you') {
    return tinted
      ? `${TILE_MD} bg-p1-tint text-p1-tint-ink shadow-[0_4px_0_var(--color-p1-tint-lip)]`
      : `${TILE_MD} bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)]`
  }
  return tinted
    ? `${TILE_MD} bg-p2-tint text-p2-tint-ink shadow-[0_4px_0_var(--color-p2-tint-lip)]`
    : `${TILE_MD} bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)]`
}

export function playerTextClass(side: Side): string {
  return side === 'you' ? 'text-p1-lip' : 'text-p2-lip'
}
