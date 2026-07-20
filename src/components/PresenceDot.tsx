/** The little "seat's warm" lamp next to an opponent who's at the table —
 *  a present friend in multiplayer, a thinking llama in solo. */
export function PresenceDot() {
  return (
    <span
      aria-hidden
      className="inline-block w-2 h-2 rounded-full bg-p2 align-middle mr-0.5 -mt-0.5 animate-pulse motion-reduce:animate-none"
    />
  )
}
