// The staircase ledger with the camera on a rail (GAME_DESIGN §The ledger
// camera) and inline play (GAME_DESIGN §Inline play & the deck). The chain
// is a pure staircase on a virtual canvas; vertical scroll drives position
// along it while the canvas translates horizontally to follow the true
// x-path. The word being typed is itself a row (the draft), so the "parked
// camera" is just the ordinary newest-row anchor applied to it: its head —
// the grip — pins to the left edge and the previous word's spent letters
// bleed off-screen. Before the first letter, the shallow grips render as a
// ghost fan, each seed aligned under the letters it takes.
// prefers-reduced-motion gets a flat vertical list; tint-joints carry the
// overlap info either way.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ChainLink, Player, PlayerId } from '../game'
import { FlagIcon } from './icons'
import { playerTextClass, sideOf } from './tiles'
import { WordTiles } from './WordTiles'

const TILE_W = 23
const GAP = 3
const STEP = TILE_W + GAP
const ROW_H = 49
const ANCHOR_X = 14 // where the current row's head sits, from the left
const ANCHOR_BOTTOM = 86 // …and from the container bottom — roomy enough that the
// fan's hint floats clear of the deck (the reclaimed slack, split below)
const BOTTOM_SNAP = 40 // within this of the end counts as "at latest"
const REVEAL_MS = 300 // unseen-word type-in starts as the camera ride lands

/** How long a reveal owns the stage: the last tile landed, plus a beat. */
function revealSpan(word: string): number {
  return REVEAL_MS + word.length * 60 + 320
}

export interface LedgerComposer {
  typed: string
  grip: number
  points: number
  canPlay: boolean
  /** Tutorial-only: the suggested finish, rendered as ghost tiles after the draft. */
  hintTail?: string
}

export interface GripOption {
  letters: string
  overlap: number
  points: number
}

interface ChainLedgerProps {
  chain: ChainLink[]
  /** Which server slot the viewer holds — their words render indigo. */
  you: PlayerId
  players: Record<PlayerId, Player>
  /** True when the newest word may be challenged by the local player. */
  canChallenge: boolean
  onChallenge: () => void
  /** The draft word, when the local player is composing. */
  composer?: LedgerComposer | null
  /** Ghost seeds, when it's the local player's move and nothing is typed. */
  fan?: GripOption[] | null
  /** The player's opening turn: show a cursor on the empty board as the cue to type. */
  openerCaret?: boolean
  /** The newest link landed while the player was away (the parent knows):
   *  type it in on mount as if the other player just played it. Words that
   *  arrive while mounted are detected internally. */
  revealOnMount?: boolean
  onSeed?: (letters: string) => void
  onPlay?: () => void
}

type DisplayRow =
  | { kind: 'link'; key: string; link: ChainLink; index: number; x: number; y: number; anchorX: number }
  | { kind: 'ghost'; key: string; option: GripOption; x: number; y: number; anchorX: number }
  | { kind: 'draft'; key: string; x: number; y: number; anchorX: number }

const GHOST_TILE =
  'w-[23px] h-[35px] shrink-0 rounded-[7px] border-2 border-dashed border-[#C9CFD8] text-dim flex items-center justify-center font-extrabold text-lg uppercase select-none'

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function linkMeta(link: ChainLink, index: number): string {
  if (index === 0) return 'opener'
  return `+${link.points}${link.challengeSurvived ? ' · real' : ''}`
}

function buildRows(
  chain: ChainLink[],
  composer: LedgerComposer | null | undefined,
  fan: GripOption[] | null | undefined,
): DisplayRow[] {
  const rows: DisplayRow[] = []
  let x = 0
  chain.forEach((link, index) => {
    if (index > 0) x += (chain[index - 1].word.length - link.overlap) * STEP
    rows.push({ kind: 'link', key: `${index}-${link.word}`, link, index, x, y: index * ROW_H, anchorX: x })
  })
  const last = chain[chain.length - 1]
  const lastX = x

  if (composer && composer.typed) {
    // The draft parks: its own x anchors the camera, pinning the grip head
    // to the screen edge. With no valid grip yet, park at the shallowest.
    const grip = Math.max(composer.grip, 2)
    const draftX = last ? lastX + (last.word.length - grip) * STEP : 0
    rows.push({
      kind: 'draft',
      key: 'draft',
      x: draftX,
      y: rows.length * ROW_H,
      anchorX: draftX,
    })
  } else if (fan && fan.length > 0 && last) {
    // Ghost seeds anchor the camera to the word they grip, so the whole
    // fan reveals beneath it without dragging the view off the chain.
    for (const option of fan) {
      rows.push({
        kind: 'ghost',
        key: `ghost-${option.overlap}`,
        option,
        x: lastX + (last.word.length - option.overlap) * STEP,
        y: rows.length * ROW_H,
        anchorX: lastX,
      })
    }
  }
  return rows
}

export function ChainLedger(props: ChainLedgerProps) {
  const reduced = useReducedMotion()
  const [detail, setDetail] = useState<{ link: ChainLink; index: number } | null>(null)

  // An opponent word the player hasn't watched land — the newest link on
  // mount (when the parent says so) or one appended while we're mounted —
  // types itself in, tile by tile. Keyed to its row so it plays exactly
  // once per word; the key simply moves on when the next reveal arrives.
  const [reveal, setReveal] = useState<string | null>(() => {
    if (!props.revealOnMount) return null
    const last = props.chain[props.chain.length - 1]
    return last && last.owner !== props.you ? `${props.chain.length - 1}-${last.word}` : null
  })
  // While the reveal types, the ghost fan — which mounts the same instant,
  // since their word arriving IS your turn starting — holds hidden, then
  // deals in row by row. Cleared on a timer so later fan mounts (a
  // backspaced draft, a next turn) come back instantly as usual.
  const [fanHold, setFanHold] = useState<number>(() => {
    if (!props.revealOnMount) return 0
    const last = props.chain[props.chain.length - 1]
    return last && last.owner !== props.you ? revealSpan(last.word) : 0
  })
  useEffect(() => {
    if (!fanHold) return
    const t = setTimeout(() => setFanHold(0), fanHold + 800)
    return () => clearTimeout(t)
  }, [fanHold])
  const chainLenRef = useRef(props.chain.length)
  useEffect(() => {
    const len = props.chain.length
    if (len > chainLenRef.current) {
      const last = props.chain[len - 1]
      if (last.owner !== props.you) {
        setReveal(`${len - 1}-${last.word}`)
        setFanHold(revealSpan(last.word))
      }
    }
    chainLenRef.current = len
  }, [props.chain, props.you])

  const rows = useMemo(
    () => buildRows(props.chain, props.composer, props.fan),
    [props.chain, props.composer, props.fan],
  )

  return (
    <div className="flex-1 relative overflow-hidden" aria-live="polite">
      {reduced ? (
        <FlatLedger {...props} rows={rows} onDetail={setDetail} />
      ) : (
        <RailLedger {...props} rows={rows} reveal={reveal} fanHold={fanHold} onDetail={setDetail} />
      )}
      {detail && (
        <DetailCard
          link={detail.link}
          index={detail.index}
          you={props.you}
          players={props.players}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

interface LedgerViewProps extends ChainLedgerProps {
  rows: DisplayRow[]
  /** Row key of the unseen opponent word currently typing itself in. */
  reveal?: string | null
  /** While > 0, ghost starters hold hidden this many ms, then deal in. */
  fanHold?: number
  onDetail: (row: { link: ChainLink; index: number }) => void
}

/** The draft row wears its entrance only briefly: `seed-pop` staggers the
 *  arrival tiles, but it must come OFF once played — its per-tile animation
 *  rules would otherwise delay every subsequently typed letter. */
function DraftRow({
  seeded,
  style,
  children,
}: {
  seeded: boolean
  style: CSSProperties
  children: ReactNode
}) {
  const [entrance, setEntrance] = useState(seeded ? 'seed-pop' : 'draft-in')
  useEffect(() => {
    if (entrance !== 'seed-pop') return
    // Fallback only — the class normally retires on the caret's own
    // animationend, so a slow frame can't cut the pops short.
    const t = setTimeout(() => setEntrance(''), 1600)
    return () => clearTimeout(t)
  }, [entrance])
  return (
    <div
      className={`flex items-center ${entrance}`}
      style={style}
      onAnimationEnd={(e) => {
        // The caret pops last; its end means the whole entrance has played.
        if (
          entrance === 'seed-pop' &&
          e.animationName === 'fill-pop' &&
          e.target === e.currentTarget.lastElementChild
        )
          setEntrance('')
      }}
    >
      {children}
    </div>
  )
}

/** Draft tiles: grip letters tinted, the rest solid, caret after. */
function DraftTiles({ composer }: { composer: LedgerComposer }) {
  return (
    <>
      <WordTiles
        word={composer.typed}
        side="you"
        headTint={Math.min(composer.grip, composer.typed.length)}
      />
      {composer.hintTail && (
        <span className="flex gap-[3px] ml-[3px]">
          {composer.hintTail.split('').map((ch, j) => (
            <span
              key={j}
              className="w-[23px] h-[35px] shrink-0 rounded-[7px] border-2 border-dashed border-[var(--color-p1-tint-lip)] text-p1-tint-ink flex items-center justify-center font-extrabold text-lg uppercase select-none"
            >
              {ch}
            </span>
          ))}
        </span>
      )}
      <span className="w-[3px] h-6 bg-p1 rounded ml-1 self-center motion-safe:animate-pulse" />
    </>
  )
}

/** The Play chip that rides the gripped word's row. */
function PlayChip({ composer, onPlay }: { composer: LedgerComposer; onPlay?: () => void }) {
  return (
    <button
      type="button"
      disabled={!composer.canPlay}
      onClick={onPlay}
      className="absolute right-3 bottom-[103px] h-11 px-5 rounded-[13px] font-extrabold text-[14px] bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] active:translate-y-0.5 active:shadow-[0_2px_0_var(--color-p1-lip)] disabled:opacity-40 disabled:active:translate-y-0 flex items-center gap-1.5 draft-in"
    >
      Play it!
      {composer.points > 0 && <small className="text-[11px] opacity-85">+{composer.points}</small>}
    </button>
  )
}

function RailLedger(props: LedgerViewProps) {
  const {
    rows,
    you,
    canChallenge,
    onChallenge,
    composer,
    reveal,
    fanHold = 0,
    onSeed,
    onPlay,
    onDetail,
  } = props
  const scrollerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const atBottomRef = useRef(true)
  const firstRef = useRef(true)
  const animatingRef = useRef(false)
  const [atBottom, setAtBottom] = useState(true)
  // Stricter than atBottom (which carries 40px of snap hysteresis): true only
  // when the board is essentially pinned to the newest row. The "tap a
  // starter" nudge keys off this so it fades the instant you scroll back,
  // instead of hanging fixed while the ghost fan slides underneath it.
  const [pinned, setPinned] = useState(true)
  // Custom scrollbar: a thin thumb that fades in while scrolling/hovering and
  // out on idle. Native scrollbar is hidden (.no-native-scrollbar).
  const [thumb, setThumb] = useState({ top: 0, height: 0 })
  const [barShown, setBarShown] = useState(false)
  const barTimer = useRef(0)
  // The turn the camera is nearest to — glowed while scrolled back so you
  // can see which step of the path you're locked onto. `away` is true only
  // when the *user* holds a scrolled-back position: it stays false during
  // programmatic glides so the glow and the pill don't chase the animation.
  const [step, setStep] = useState(0)
  const [away, setAway] = useState(false)
  // Ghost-tap choreography — the camera rides, the words never move
  // (direction settled 2026-07-13): the whole fan bows out, the camera
  // glides along the rail to the draft's parked position (the same scroll +
  // pan it uses everywhere else), and only once it has arrived do the seed
  // tiles pop in, caret last. The scroll target is the new parked position
  // in BOTH geometries, so the fan→draft swap never moves a pixel.
  const [seeding, setSeeding] = useState(false)
  const seedingRef = useRef(false)
  // Whether the current draft arrived by seed ride (tiles pop in) or by
  // typing (draft-in settle) — must hold steady across re-renders.
  const [seeded, setSeeded] = useState(false)
  const seededRef = useRef(false)
  seededRef.current = seeded
  // Whether the draft row was present last render — so we can catch the exact
  // frame typing turns the fan into a draft and ride the camera in.
  const hadDraftRef = useRef(false)
  const seedTimer = useRef(0)
  const composerTypedRef = useRef(false)
  composerTypedRef.current = !!composer?.typed
  useEffect(
    () => () => {
      clearTimeout(seedTimer.current)
      clearTimeout(barTimer.current)
    },
    [],
  )
  useEffect(() => {
    if (!composer?.typed && seeded) setSeeded(false)
  }, [composer?.typed, seeded])

  // Glide the camera along the rail to a parked framing: pan the canvas to
  // pin targetX at the anchor while the scroll carries the board to targetTop.
  // applyCamera stays hands-off (seedingRef) until the commit so the two
  // glides can't fight; the scroll target is the parked position in BOTH the
  // outgoing and incoming geometries, so a landed swap can't re-snap or jump.
  // onArrive fires once the ride has actually settled — a hard deadline covers
  // an interrupted ride. Shared by grip-tap seeding and type-to-start.
  const glideCamera = (targetX: number, targetTop: number, onArrive?: () => void) => {
    const sc = scrollerRef.current
    const cv = canvasRef.current
    if (!sc || !cv) return
    seedingRef.current = true // sync — scroll events land before the re-render
    animatingRef.current = true
    cv.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.3, 1.12)'
    cv.style.transform = `translate3d(${Math.round(ANCHOR_X - targetX)}px, 0, 0)`
    sc.scrollTo({ top: targetTop, behavior: 'smooth' })
    const start = performance.now()
    const commit = () => {
      const elapsed = performance.now() - start
      if ((Math.abs(sc.scrollTop - targetTop) > 1 || elapsed < 380) && elapsed < 900) {
        seedTimer.current = window.setTimeout(commit, 40)
        return
      }
      sc.scrollTop = targetTop
      cv.style.transition = ''
      seedingRef.current = false
      onArrive?.()
    }
    seedTimer.current = window.setTimeout(commit, 380)
  }

  const seedTap = (option: GripOption, x: number) => {
    if (!onSeed || seedingRef.current || !scrollerRef.current || !canvasRef.current) return
    setSeeding(true)
    // Ride to the seed's parked framing; only once landed do the tiles pop in.
    glideCamera(x, props.chain.length * ROW_H, () => {
      setSeeded(true)
      // If they typed (or the turn moved on) mid-ride, the tap yields.
      if (!composerTypedRef.current) onSeed(option.letters)
      setSeeding(false)
    })
  }

  const scrollRange = Math.max(0, rows.length - 1) * ROW_H

  /** Camera x at fractional row position t, following per-row anchors. */
  const xAt = (t: number): number => {
    const r = rowsRef.current
    if (r.length === 0) return 0
    if (t <= 0) return r[0].anchorX
    if (t >= r.length - 1) return r[r.length - 1].anchorX
    const i = Math.floor(t)
    return r[i].anchorX + (r[i + 1].anchorX - r[i].anchorX) * (t - i)
  }

  const applyCamera = () => {
    const sc = scrollerRef.current
    const cv = canvasRef.current
    if (!sc || !cv) return
    const t = sc.scrollTop / ROW_H
    // During the seed ride the canvas pans on its own CSS transition.
    if (!seedingRef.current) cv.style.transform = `translate3d(${Math.round(ANCHOR_X - xAt(t))}px, 0, 0)`
    const fromBottom = Math.max(0, rowsRef.current.length - 1) * ROW_H - sc.scrollTop
    const near = fromBottom < BOTTOM_SNAP
    atBottomRef.current = near
    if (near) animatingRef.current = false
    setAtBottom((prev) => (prev === near ? prev : near))
    const isAway = !near && !animatingRef.current
    setAway((prev) => (prev === isAway ? prev : isAway))
    const at = Math.min(Math.max(0, rowsRef.current.length - 1), Math.max(0, Math.round(t)))
    setStep((prev) => (prev === at ? prev : at))
    const pin = fromBottom < 4
    setPinned((prev) => (prev === pin ? prev : pin))
    // Thumb geometry from the real scroll metrics (scrollRange is the max top).
    const track = sc.clientHeight
    if (sc.scrollHeight > track + 1 && scrollRange > 0) {
      const h = Math.max(28, (track * track) / sc.scrollHeight)
      const top = (sc.scrollTop / scrollRange) * (track - h)
      setThumb((prev) => (Math.abs(prev.top - top) < 0.5 && prev.height === h ? prev : { top, height: h }))
    } else {
      setThumb((prev) => (prev.height === 0 ? prev : { top: 0, height: 0 }))
    }
  }
  const applyCameraRef = useRef(applyCamera)
  applyCameraRef.current = applyCamera

  // Same-frame, no rAF hop: the horizontal follow must not trail the
  // native vertical motion or the camera wobbles off the diagonal mid-flick.
  // Wake the scrollbar, then fade it after a beat of stillness.
  const pokeBar = () => {
    setBarShown(true)
    clearTimeout(barTimer.current)
    barTimer.current = window.setTimeout(() => setBarShown(false), 900)
  }
  const onScroll = () => {
    applyCameraRef.current()
    pokeBar()
  }
  // Any touch or wheel means the user owns the scroll again.
  const onTake = () => {
    animatingRef.current = false
  }

  // Follow new rows when pinned to the latest; never yank when scrolled back.
  useLayoutEffect(() => {
    const sc = scrollerRef.current
    if (!sc) return
    const draftRow = rows.find((r) => r.kind === 'draft')
    // The frame typing turns the parked fan into a draft: ride the camera to
    // the draft's park instead of snapping the horizontal pan. Only when
    // parked (never yank a scrolled-back view) and not a seed tap (that ride
    // already framed the draft, tiles-first).
    const enteringDraft = !!draftRow && !hadDraftRef.current
    hadDraftRef.current = !!draftRow
    if (firstRef.current) {
      firstRef.current = false
      sc.scrollTop = scrollRange
    } else if (
      enteringDraft &&
      atBottomRef.current &&
      !seededRef.current &&
      !seedingRef.current
    ) {
      glideCamera(draftRow!.x, scrollRange, () => applyCameraRef.current())
      return
    } else if (atBottomRef.current && !seedingRef.current) {
      animatingRef.current = true
      sc.scrollTo({ top: scrollRange, behavior: 'smooth' })
    }
    applyCameraRef.current()
  }, [scrollRange, rows])

  useEffect(() => {
    const sc = scrollerRef.current
    if (!sc) return
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) sc.scrollTop = Math.max(0, rowsRef.current.length - 1) * ROW_H
      applyCameraRef.current()
    })
    ro.observe(sc)
    return () => ro.disconnect()
  }, [])

  const chainLast = props.chain.length - 1
  const firstGhost = rows.findIndex((r) => r.kind === 'ghost')

  const rowNodes = rows.map((row, rowIndex) => {
            const common = { position: 'absolute' as const, left: row.x, top: row.y }
            // The locked-turn glow: only while scrolled back along the path,
            // in the color of whoever played the word.
            const locked = away && rowIndex === step
            if (row.kind === 'link') {
              const side = sideOf(row.link.owner, you)
              const glow = !locked
                ? ''
                : side === 'you'
                  ? ' bg-white shadow-[0_0_0_3px_rgba(139,144,244,0.9),0_0_18px_6px_rgba(139,144,244,0.35)]'
                  : ' bg-white shadow-[0_0_0_3px_rgba(249,139,87,0.9),0_0_18px_6px_rgba(249,139,87,0.35)]'
              const next = props.chain[row.index + 1]
              const isChainTip = row.index === chainLast
              const liveTint = isChainTip && composer?.typed ? composer.grip : 0
              const challengeable = isChainTip && canChallenge && !composer?.typed
              // The unseen-word reveal: tiles type in one by one instead of
              // the row sliding in whole; the meta and flag hold until the
              // last tile has landed.
              const revealing = row.key === reveal
              const revealDone = REVEAL_MS + row.link.word.length * 60
              const trim = revealing
                ? { className: ' typein-meta', style: { animationDelay: `${revealDone}ms` } }
                : { className: '', style: undefined }
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() =>
                    challengeable ? onChallenge() : onDetail({ link: row.link, index: row.index })
                  }
                  className={`flex items-center gap-2 -m-1.5 p-1.5 rounded-xl active:bg-board-lo ${revealing ? '' : 'row-settle '}transition-shadow duration-150${glow}`}
                  style={common}
                  aria-label={
                    challengeable
                      ? `Challenge ${row.link.word.toUpperCase()}`
                      : `${row.link.word.toUpperCase()} details`
                  }
                >
                  <WordTiles
                    word={row.link.word}
                    side={side}
                    headTint={row.link.overlap}
                    tailTint={next?.overlap ?? liveTint}
                    typeinFrom={revealing ? REVEAL_MS : undefined}
                  />
                  {challengeable && (
                    <span className={`bg-white text-p2-lip rounded-full w-7 h-7 flex items-center justify-center shadow-[0_3px_0_#E2DDD3]${trim.className}`} style={trim.style}><FlagIcon className="w-4 h-4" /></span>
                  )}
                  <span className={`text-[10px] font-extrabold text-dim whitespace-nowrap${trim.className}`} style={trim.style}>
                    {locked
                      ? `word ${row.index + 1} of ${props.chain.length} · ${linkMeta(row.link, row.index)}`
                      : isChainTip && composer?.typed
                        ? `overlap ${composer.grip}`
                        : linkMeta(row.link, row.index)}
                  </span>
                </button>
              )
            }
            if (row.kind === 'ghost') {
              // After a reveal, the fan waits for the word to finish typing,
              // then deals in shallowest-first (delays past fanHold).
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => seedTap(row.option, row.x)}
                  className={`flex items-center gap-2 -m-1.5 p-1.5 rounded-xl active:bg-board-lo transition-opacity duration-150${
                    seeding ? ' opacity-0 pointer-events-none' : ''
                  }${fanHold ? ' ghost-in' : ''}`}
                  style={
                    fanHold
                      ? { ...common, animationDelay: `${fanHold + (rowIndex - firstGhost) * 70}ms` }
                      : common
                  }
                  aria-label={`Start with ${row.option.letters.toUpperCase()}`}
                >
                  <span className="flex gap-[3px]">
                    {row.option.letters.split('').map((ch, j) => (
                      <span key={j} className={GHOST_TILE}>
                        {ch}
                      </span>
                    ))}
                  </span>
                  <span className="text-[10px] font-extrabold text-dim whitespace-nowrap">
                    · {row.option.points}+
                  </span>
                </button>
              )
            }
            // draft
            return (
              <DraftRow key={row.key} seeded={seeded} style={common}>
                {composer && <DraftTiles composer={composer} />}
              </DraftRow>
            )
  })

  const fanShowing = rows.some((r) => r.kind === 'ghost')

  return (
    <>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onPointerDown={onTake}
        onPointerMove={pokeBar}
        onWheel={onTake}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain snap-y snap-mandatory no-native-scrollbar"
      >
        {/* One snap marker per row: the scroll can only settle on a turn,
            never between two — and a fling stops at the very next one, so
            the path is walked step by step. The tail spacer adds a viewport
            (minus the last marker) so the newest row can sit at the anchor.
            Markers are keyed by INDEX on purpose: they are pure geometry,
            and keeping the snapped node alive across a fan→draft swap stops
            the snap container from re-snapping to the top. */}
        {rows.map((_, i) => (
          <div key={i} className="snap-start snap-always" style={{ height: ROW_H }} />
        ))}
        <div style={{ height: `calc(100% - ${rows.length ? ROW_H : 0}px)` }} />
        <div
          ref={canvasRef}
          className="absolute left-0 will-change-transform"
          style={{ top: `calc(100% - ${ANCHOR_BOTTOM}px)` }}
        >
          <Rail rows={rows} />
          {rows.length === 0 && (
            <>
              {props.openerCaret && (
                <span className="absolute left-0 top-0 h-9 w-[3px] bg-p1 rounded motion-safe:animate-pulse" />
              )}
              <p className="absolute left-3.5 top-12 w-64 text-dim font-bold text-sm">
                {props.openerCaret
                  ? 'Tap any letter to open — your word can be anything, three letters or more.'
                  : 'The chain starts with you. Any word, three letters or more…'}
              </p>
            </>
          )}
          {rowNodes}
        </div>
      </div>
      {/* The nudge is screen furniture, not a board object: centered so a
          long word's far-right fan can't drag it off the edge. */}
      {fanShowing && pinned && (
        <p
          className={`absolute inset-x-0 bottom-[28px] text-center text-[10px] font-extrabold text-dim uppercase tracking-wider pointer-events-none transition-opacity duration-150${
            seeding ? ' opacity-0' : ''
          }${fanHold ? ' typein-meta' : ''}`}
          style={fanHold ? { animationDelay: `${fanHold + 150}ms` } : undefined}
        >
          tap a starter, or just type — deeper scores more
        </p>
      )}
      {/* Custom scrollbar: fades in while scrolling or hovering, out on idle. */}
      <div
        aria-hidden
        className={`absolute inset-y-0 right-0.5 w-1.5 z-10 pointer-events-none transition-opacity duration-300 ${
          barShown && thumb.height > 0 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className="w-full rounded-full bg-ink-strong/25"
          style={{ transform: `translateY(${thumb.top}px)`, height: thumb.height }}
        />
      </div>
      {composer?.typed && atBottom && <PlayChip composer={composer} onPlay={onPlay} />}
      {away && (
        <button
          type="button"
          // pointerdown, not click: a tap that lands while the snap glide is
          // still settling gets eaten as "stop scrolling" and never clicks —
          // the double-tap-to-go-home bug on the phone.
          onPointerDown={() => {
            animatingRef.current = true
            scrollerRef.current?.scrollTo({ top: scrollRange, behavior: 'smooth' })
          }}
          className="absolute bottom-3 right-3 bg-ink-strong text-white font-extrabold text-xs rounded-full px-3.5 py-2 shadow-[0_4px_0_#262E38] z-10"
        >
          ▼ Latest
        </button>
      )}
    </>
  )
}

/** The dotted thread tracing the chain's diagonal, behind the tiles. */
function Rail({ rows }: { rows: DisplayRow[] }) {
  const pathRows = rows.filter((r) => r.kind === 'link' || r.kind === 'draft')
  if (pathRows.length < 2) return null
  const pts = pathRows.map((r) => `${r.x + 12},${r.y + 16}`)
  const maxX = Math.max(...pathRows.map((r) => r.x)) + 400
  return (
    <svg
      className="absolute left-0 top-0 pointer-events-none"
      width={maxX}
      height={rows.length * ROW_H + 40}
    >
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="#E4DFD5"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1 8"
      />
    </svg>
  )
}

/** Accessibility fallback: plain vertical list, tint-joints intact. */
function FlatLedger(props: LedgerViewProps & { initialRow?: number; pinBottom?: boolean }) {
  const { rows, you, canChallenge, onChallenge, composer, onSeed, onPlay, onDetail } = props
  const { initialRow, pinBottom = true } = props
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const target =
      initialRow !== undefined ? el.querySelector(`[data-row="${initialRow}"]`) : null
    if (target) target.scrollIntoView({ block: 'center' })
    else el.scrollTop = el.scrollHeight
    // position once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useLayoutEffect(() => {
    const el = ref.current
    if (el && pinBottom) el.scrollTop = el.scrollHeight
  }, [rows.length, pinBottom])
  const chainLast = props.chain.length - 1
  const ghosts = rows.filter((r) => r.kind === 'ghost')
  return (
    <div ref={ref} className="absolute inset-0 overflow-y-auto px-3.5 py-3 flex flex-col">
      <div className="mt-auto" />
      {props.chain.length === 0 && !composer?.typed && (
        <div className="flex items-center gap-2 pb-4">
          {props.openerCaret && <span className="h-9 w-[3px] bg-p1 rounded motion-safe:animate-pulse" />}
          <p className="text-dim font-bold text-sm">
            {props.openerCaret
              ? 'Tap any letter to open — your word can be anything, three letters or more.'
              : 'The chain starts with you. Any word, three letters or more…'}
          </p>
        </div>
      )}
      {props.chain.map((link, index) => {
        const next = props.chain[index + 1]
        const isChainTip = index === chainLast
        const liveTint = isChainTip && composer?.typed ? composer.grip : 0
        const challengeable = isChainTip && canChallenge && !composer?.typed
        return (
          <button
            key={`${index}-${link.word}`}
            data-row={index}
            type="button"
            onClick={() => (challengeable ? onChallenge() : onDetail({ link, index }))}
            className="flex items-center gap-2 min-h-11 py-1 text-left"
            aria-label={
              challengeable
                ? `Challenge ${link.word.toUpperCase()}`
                : `${link.word.toUpperCase()} details`
            }
          >
            <WordTiles
              word={link.word}
              side={sideOf(link.owner, you)}
              headTint={link.overlap}
              tailTint={next?.overlap ?? liveTint}
            />
            {challengeable && (
              <span className="bg-white text-p2-lip rounded-full w-7 h-7 flex items-center justify-center shadow-[0_3px_0_#E2DDD3]"><FlagIcon className="w-4 h-4" /></span>
            )}
            <span className="text-[10px] font-extrabold text-dim whitespace-nowrap">
              {isChainTip && composer?.typed ? `overlap ${composer.grip}` : linkMeta(link, index)}
            </span>
          </button>
        )
      })}
      {ghosts.length > 0 && (
        <div className="flex items-center gap-3 min-h-11 flex-wrap py-1">
          {ghosts.map(
            (g) =>
              g.kind === 'ghost' && (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => onSeed?.(g.option.letters)}
                  className="flex items-center gap-1.5"
                >
                  <span className="flex gap-[3px]">
                    {g.option.letters.split('').map((ch, j) => (
                      <span key={j} className={GHOST_TILE}>
                        {ch}
                      </span>
                    ))}
                  </span>
                  <span className="text-[10px] font-extrabold text-dim">· {g.option.points}+</span>
                </button>
              ),
          )}
        </div>
      )}
      {composer?.typed && (
        <div className="flex items-center gap-3 min-h-11 py-1">
          <DraftTiles composer={composer} />
          <span className="ml-auto">
            <PlayChipFlat composer={composer} onPlay={onPlay} />
          </span>
        </div>
      )}
    </div>
  )
}

function PlayChipFlat({ composer, onPlay }: { composer: LedgerComposer; onPlay?: () => void }) {
  return (
    <button
      type="button"
      disabled={!composer.canPlay}
      onClick={onPlay}
      className="h-11 px-5 rounded-[13px] font-extrabold text-[14px] bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] disabled:opacity-40 flex items-center gap-1.5"
    >
      Play it!
      {composer.points > 0 && <small className="text-[11px] opacity-85">+{composer.points}</small>}
    </button>
  )
}

/** The margin receipts: tap any history row for the full story. */
function DetailCard({
  link,
  index,
  you,
  players,
  onClose,
}: {
  link: ChainLink
  index: number
  you: PlayerId
  players: Record<PlayerId, Player>
  onClose: () => void
}) {
  const side = sideOf(link.owner, you)
  return (
    <div className="fixed inset-0 bg-ink-strong/30 flex items-end z-20" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-9 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <WordTiles word={link.word} side={side} />
        <p className="font-bold text-ink text-[14px]">
          <span className={`font-extrabold ${playerTextClass(side)}`}>
            {players[link.owner].name}
          </span>{' '}
          · word {index + 1}
          {index === 0
            ? ' · the opener (no points)'
            : ` · overlapped ${link.overlap} letters for ${link.points} points`}
        </p>
        {link.challengeSurvived && (
          <p className="font-bold text-ink text-[14px] flex items-center gap-1.5">
            <FlagIcon className="w-4 h-4 text-p2-lip" /> Challenged — and it was real.
          </p>
        )}
        <button onClick={onClose} className="h-11 rounded-xl font-extrabold text-dim self-start">
          Close
        </button>
      </div>
    </div>
  )
}
