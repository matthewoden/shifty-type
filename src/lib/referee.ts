// Challenge resolution: embedded list first (instant, offline-friendly),
// Free Dictionary API second, 'unknown' when the referee is unreachable —
// the UI then falls back to the coin flip to settle it.

import { WORD_SET } from '../game/wordlist'

export type Verdict = 'real' | 'fake' | 'unknown'

export async function lookupWord(word: string): Promise<Verdict> {
  if (WORD_SET.has(word)) return 'real'
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (res.ok) return 'real'
    if (res.status === 404) return 'fake'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
