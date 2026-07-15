// Table-talk toast: slides up to arrive, sinks away to leave — never just
// vanishes. Holds the last message through the exit animation, unmounting
// on animationend (reduced motion shrinks the animations to 10ms so the
// event still fires).

import { useEffect, useState } from 'react'

export function Toast({ message }: { message: string | null }) {
  const [shown, setShown] = useState(message)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (message) {
      setShown(message)
      setLeaving(false)
    } else {
      setShown((prev) => {
        if (prev) setLeaving(true)
        return prev
      })
    }
  }, [message])

  if (!shown) return null
  return (
    <div
      onAnimationEnd={() => {
        if (leaving) {
          setShown(null)
          setLeaving(false)
        }
      }}
      className={`mx-3.5 mb-2 text-center text-[13px] font-bold text-ink bg-white rounded-xl py-2 shadow-[0_3px_0_#E2DDD3] ${
        leaving ? 'toast-out' : 'toast-in'
      }`}
    >
      {shown}
    </div>
  )
}
