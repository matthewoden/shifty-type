// Regenerates src/game/wordlist.ts — the bot's vocabulary, the instant-real
// verdict list for challenges, and the offline dictionary fallback.
//
// Pipeline: google-10000-english-usa-no-swears (web-frequency order, swears
// already dropped) → keep 3–40 letter lowercase a–z words that also appear in
// /usr/share/dict/words (drops web junk and abbreviations) → all survivors,
// frequency order preserved.
//
// Usage: node scripts/generate-wordlist.mjs [path-to-source-list]
// With no argument the source is fetched from GitHub.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_URL =
  'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt'
const DICT_PATH = '/usr/share/dict/words'
const OUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/game/wordlist.ts',
)
const WORDS_PER_LINE = 12

async function loadSource() {
  const local = process.argv[2]
  if (local) return fs.readFileSync(local, 'utf8')
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${SOURCE_URL}`)
  return res.text()
}

const dict = new Set(fs.readFileSync(DICT_PATH, 'utf8').split('\n'))
const source = (await loadSource()).split('\n').map((w) => w.trim())
const words = source.filter((w) => /^[a-z]{3,40}$/.test(w) && dict.has(w))

const lines = []
for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
  const chunk = words.slice(i, i + WORDS_PER_LINE)
  lines.push('  ' + chunk.map((w) => `'${w}'`).join(', ') + ',')
}

const banner = `// ${words.length.toLocaleString('en-US')} common English words: the bot's vocabulary, the instant-real
// verdict list for challenges, and the offline dictionary fallback.
// Generated from the google-10000-english-usa-no-swears frequency list,
// filtered to 3–40 letter lowercase words that also appear in
// /usr/share/dict/words (drops web junk and abbreviations); all survivors
// kept in frequency order. Regenerate with scripts/generate-wordlist.mjs.

export const WORD_LIST: readonly string[] = [
`

const footer = `]

export const WORD_SET: ReadonlySet<string> = new Set(WORD_LIST)

export function isListWord(word: string): boolean {
  return WORD_SET.has(word.toLowerCase())
}
`

fs.writeFileSync(OUT_PATH, banner + lines.join('\n') + '\n' + footer)
console.log(`wrote ${words.length} words to ${OUT_PATH}`)
