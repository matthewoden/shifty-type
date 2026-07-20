// Records the README demo: a real solo match vs Lloyd at phone size,
// with tap ripples and unhurried pacing, ending as docs/demo.mp4.
//
// Usage:
//   npm run dev                       # in one terminal (note the port)
//   npm install --no-save playwright ffmpeg-static   # one-time, kept out of package.json
//   node scripts/record-demo.mjs [baseUrl]           # default http://localhost:5173
//
// The whole match line is planned offline first — our words come from the
// embedded word list, and Lloyd's replies are predicted with an exact port
// of his deterministic easy-mode pick — so the run never dead-ends on a
// tail with no continuations (e.g. "electronics"). If the UI labels or
// Lloyd's logic change, the ports below must follow.
//
// After recording, drag the new docs/demo.mp4 into any GitHub issue comment
// box and swap the resulting user-attachments URL into README.md — that URL
// is what GitHub renders as the inline player (committed files don't).

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT_MP4 = path.join(ROOT, 'docs', 'demo.mp4')
const WORK_DIR = fs.mkdtempSync(path.join(ROOT, 'node_modules', '.demo-'))
const OUR_WORDS = 4 // opener + 3 replies

let chromium, ffmpegPath
try {
  ;({ chromium } = await import('playwright'))
  ffmpegPath = (await import('ffmpeg-static')).default
} catch {
  console.error('Missing recorder deps. Run: npm install --no-save playwright ffmpeg-static')
  process.exit(1)
}

const src = fs.readFileSync(path.join(ROOT, 'src/game/wordlist.ts'), 'utf8')
const WORDS = [...src.matchAll(/'([a-z]{3,})'/g)].map((m) => m[1])

// --- exact ports from src/game (engine.overlapOf, easy-bot pick) ---
function overlapOf(prev, next) {
  const max = Math.min(prev.length, next.length)
  for (let k = max; k >= 2; k--) {
    if (next.length < k + 2) continue
    if (prev.slice(-k) === next.slice(0, k)) return k
  }
  return 0
}

function lloydReply(last, used) {
  let best = null
  for (const w of WORDS) {
    if (w.length > 12 || used.has(w)) continue
    const ov = overlapOf(last, w)
    if (ov < 2) continue
    if (ov === 2) return w // first 2-overlap in frequency order
    if (!best || ov < best.ov) best = { w, ov }
  }
  return best?.w ?? null
}

// --- offline match planner ---
function ourCandidates(prev, used) {
  const out = []
  for (const ov of [3, 2]) {
    if (prev.length < ov) continue
    const suf = prev.slice(-ov)
    const cands = WORDS.filter(
      (w) => w.startsWith(suf) && w.length >= ov + 2 && w.length <= 10 && !used.has(w),
    )
    out.push(
      ...cands
        .slice(0, 20)
        .sort((a, b) => Math.abs(a.length - 7) - Math.abs(b.length - 7))
        .slice(0, 8),
    )
  }
  return out
}

function planFrom(ourWord, used, depth, line) {
  used.add(ourWord)
  line.push({ us: ourWord })
  const lloyd = lloydReply(ourWord, used)
  if (lloyd) {
    used.add(lloyd)
    line[line.length - 1].lloyd = lloyd
    if (depth === OUR_WORDS - 1) return true // Lloyd's closing word lands
    for (const next of ourCandidates(lloyd, used)) {
      if (planFrom(next, used, depth + 1, line)) return true
    }
    used.delete(lloyd)
  }
  used.delete(ourWord)
  line.pop()
  return false
}

function planMatch() {
  const openers = ['llama', 'shifty', 'cinema', 'drama', 'extra', 'chapter', 'butter', 'stone']
    .filter((w) => WORDS.includes(w))
    .concat(WORDS.filter((w) => w.length >= 4 && w.length <= 7).slice(0, 100))
  for (const opener of openers) {
    const line = []
    if (planFrom(opener, new Set(), 0, line)) return line
  }
  return null
}

// --- browser driver ---
const jitter = (ms) => ms + Math.random() * ms * 0.6

// A soft ring at every tap so the viewer can follow the finger.
const TAP_RIPPLE = () => {
  addEventListener(
    'pointerdown',
    (e) => {
      const d = document.createElement('div')
      d.style.cssText = `position:fixed;left:${e.clientX - 16}px;top:${e.clientY - 16}px;width:32px;height:32px;border-radius:9999px;background:rgba(76,70,120,.22);border:2.5px solid rgba(76,70,120,.5);pointer-events:none;z-index:99999;transform:scale(.55);opacity:1;transition:transform .38s ease-out,opacity .38s ease-out`
      document.body.appendChild(d)
      requestAnimationFrame(() => {
        d.style.transform = 'scale(1.5)'
        d.style.opacity = '0'
      })
      setTimeout(() => d.remove(), 480)
    },
    true,
  )
}

async function getSave(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  }, 'wordchain.solo.v1')
}

async function waitForMyTurn(page, minChain) {
  for (let i = 0; i < 50; i++) {
    const save = await getSave(page)
    if (save?.state?.phase === 'P1_TURN' && save.state.chain.length >= minChain) return save
    await page.waitForTimeout(300)
  }
  return null
}

async function typeWord(page, word) {
  for (const ch of word) {
    await page.getByRole('button', { name: new RegExp(`^${ch}$`, 'i') }).first().click()
    await page.waitForTimeout(jitter(170))
  }
  await page.waitForTimeout(jitter(550))
  await page.getByRole('button', { name: /play it!/i }).click()
}

async function attempt(browser, plan, n) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    // recordVideo size must equal the viewport — larger sizes letterbox.
    recordVideo: { dir: WORK_DIR, size: { width: 390, height: 844 } },
  })
  await context.addInitScript(TAP_RIPPLE)
  const page = await context.newPage()
  let ok = false
  try {
    await page.goto(BASE)
    await page.waitForTimeout(3000) // let the home screen and logo type-in land
    await page.getByRole('button', { name: /play against a local llama/i }).click()
    await page.waitForTimeout(2200) // linger on the llama picker
    await page.getByRole('button', { name: /lloyd/i }).click()
    await page.waitForTimeout(2500) // arrive at the empty board before typing

    let chainLen = 0
    for (const [i, step] of plan.entries()) {
      await typeWord(page, step.us)
      chainLen++
      const save = await waitForMyTurn(page, chainLen + 1)
      if (!save) throw new Error(`Lloyd never answered "${step.us}"`)
      chainLen = save.state.chain.length
      const actual = save.state.chain[chainLen - 1].word
      if (actual !== step.lloyd)
        console.log(`[${n}] predicted "${step.lloyd}" but Lloyd played "${actual}"`)
      if (i < plan.length - 1) await page.waitForTimeout(jitter(1400)) // read Lloyd's word
    }
    await page.waitForTimeout(3500) // linger on the finished board
    ok = true
  } catch (err) {
    console.error(`[${n}] FAILED: ${err.message}`)
  }
  const video = page.video()
  await context.close()
  const webm = video ? await video.path() : null
  if (ok && webm) return webm
  if (webm) fs.rmSync(webm, { force: true })
  return null
}

const plan = planMatch()
if (!plan) {
  console.error('no plan found')
  process.exit(1)
}
console.log('plan:', plan.map((s) => `${s.us} -> ${s.lloyd}`).join(' | '))

const browser = await chromium.launch()
let webm = null
for (let n = 1; n <= 3 && !webm; n++) webm = await attempt(browser, plan, n)
await browser.close()

if (!webm) {
  console.error('ALL ATTEMPTS FAILED')
  process.exit(1)
}
execFileSync(ffmpegPath, [
  '-y', '-loglevel', 'error', '-i', webm,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  OUT_MP4,
])
fs.rmSync(WORK_DIR, { recursive: true, force: true })
console.log(`SUCCESS: ${OUT_MP4} (${Math.round(fs.statSync(OUT_MP4).size / 1024)}KB)`)
