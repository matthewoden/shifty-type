import { TileLockup } from './TileLockup'

/**
 * The name plays itself in, as a real move: SHIFTY pops in solid, TYPE types
 * itself in tile by tile, and SHIFTY's tail TY spends to tint as the grip
 * lands. Shared by Home and the invite landing.
 */
export function Logo() {
  return <TileLockup top="shifty" bottom="type" />
}
