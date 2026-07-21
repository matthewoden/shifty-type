import { DurableObject } from 'cloudflare:workers'
import {
  applyMove,
  createMatch as newMatchState,
  isChainBroken,
  joinMatch,
  lastCallActorOf,
  opponentOf,
  type MatchState,
  type Move,
  type PlayerId,
} from '../game'
import { lookupWord } from '../lib/referee'
import { sendPush, type PushSubscriptionJSON, type VapidConfig } from './webpush'
import type {
  ClientMove,
  CreateResponse,
  GetResponse,
  JoinResponse,
  LastEvent,
  MatchSummary,
  MatchView,
  MoveResponse,
  NudgePayload,
  Presence,
  PreviewResponse,
  SocketPush,
} from '../lib/protocol'

const MATCH_TTL_MS = 60 * 24 * 60 * 60 * 1000 // 60 days of silence → cleanup
// One week of silence → a single "your match has gone quiet" nudge. One per
// quiet spell: any move re-arms it, the deletion alarm follows if it stays
// quiet. (.dev.vars can override REMINDER_DELAY_MS to test the alarm chain.)
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000
/** A seat is only warm while its heartbeat is fresh: the client pings every
 *  25s, so two missed beats plus slack. Hidden desktop tabs keep their socket
 *  open but stop pinging, and vanished phones leave corpses the runtime may
 *  not close for minutes — both must read as "away", because the presence
 *  copy promises real attention and the note pill hides behind it. */
const PRESENCE_TIMEOUT_MS = 60 * 1000

// 32 unambiguous characters (no 0/O/1/I) — 32 divides 256, so random bytes
// map to codes without modulo bias.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

interface StoredMatch {
  code: string
  state: MatchState
  tokens: { p1: string; p2: string | null }
  /** Who opened this game; rematches swap it. */
  opener: PlayerId
  revision: number
  lastEvent?: LastEvent | null
  /** ms-epoch of the last activity (create/join/move). Stamped by persist();
   *  the lobby reads it for "2h ago". Absent on matches created before it. */
  lastMoveAt?: number
  /** One quiet-table reminder has gone out for the current silence. Cleared
   *  by every persist(); flipped by the first alarm without a revision bump. */
  reminded?: boolean
}

/** Web Push subscriptions, stored apart from the match ('push' key) so
 *  subscribing never bumps `revision` or rides along in views. */
type PushSubs = Partial<Record<PlayerId, PushSubscriptionJSON>>

/** The lock-screen line for whoever must act next. Second person, card-table
 *  voice; the app itself does the full narration once they open it. */
function nudgeBody(m: StoredMatch): string {
  const s = m.state
  const ev = m.lastEvent
  const name = ev ? s.players[ev.by].name : 'Your friend'
  if (s.phase === 'GAME_OVER' || s.phase === 'CHAIN_COMPLETE')
    return `That's game with ${name} — come see how the chain ended.`
  if (!ev) return `${name} is waiting on you — your move.`
  const word = 'word' in ev ? ev.word.toUpperCase() : ''
  // Last call: the chain just filled, and the recipient has the closing move.
  if (s.phase === 'LAST_CALL' && ev.kind === 'play')
    return `${name} played their last word, ${word} — shake on it or challenge.`
  switch (ev.kind) {
    case 'play':
      return `${name} played ${word} — your move.`
    case 'pass':
      return ev.snapped
        ? `${name} passed too — the chain snapped. Start a fresh chain, any word.`
        : `${name} passed — your move.`
    case 'real':
      return `Ruling's in — ${word} stands. Your move.`
    case 'fake':
      return `Busted — ${word} was a fake. Your move.`
    case 'accept':
      // Unreachable in practice — an accept always lands in a terminal phase.
      return `${name} shook on ${word} — that's game.`
    case 'rematch':
      return `${name} started a fresh chain — rematch is on.`
  }
}

/**
 * One Durable Object per match, addressed by idFromName(code). The single
 * authority on match state: it runs the shared applyMove(), resolves
 * challenge verdicts, and is the only writer. SQLite-backed storage.
 */
export class MatchDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Answer client heartbeats in the runtime, without waking (or billing)
    // the hibernated object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  private async load(): Promise<StoredMatch | undefined> {
    const m = await this.ctx.storage.get<StoredMatch>('match')
    // Migration: a match mid-challenge when the fold/stand flow was removed.
    // The pending phase no longer exists, so hand the turn to the challenger
    // (they play on from the tail) and drop the stale field. Persisted lazily
    // by the next move; a bare read stays correct because we re-migrate.
    if (m && (m.state.phase as string) === 'CHALLENGE_PENDING') {
      const stale = m.state as unknown as { phase: string; challenger?: PlayerId | null }
      m.state.phase = stale.challenger === 'p2' ? 'P2_TURN' : 'P1_TURN'
      delete stale.challenger
    }
    return m
  }

  private remindAfterMs(): number {
    // Test seam: .dev.vars only, never set in production.
    const override = Number((this.env as { REMINDER_DELAY_MS?: string }).REMINDER_DELAY_MS ?? '')
    return override > 0 ? override : REMIND_AFTER_MS
  }

  private async persist(m: StoredMatch): Promise<void> {
    m.revision++
    m.lastMoveAt = Date.now() // "2h ago" in the lobby; only real activity counts
    m.reminded = false // activity opens a fresh quiet spell
    await this.ctx.storage.put('match', m)
    await this.ctx.storage.setAlarm(Date.now() + this.remindAfterMs())
  }

  /** A player's accepted sockets that are actually still open. The filter
   *  matters inside webSocketClose(), where the closing socket can still be
   *  listed — counting it would broadcast a stale "present". */
  private socketsFor(you: PlayerId): WebSocket[] {
    return this.ctx
      .getWebSockets(you)
      .filter((ws) => ws.readyState === WebSocket.READY_STATE_OPEN)
  }

  private presenceTimeoutMs(): number {
    // Test seam: .dev.vars only, never set in production.
    const override = Number((this.env as { PRESENCE_TIMEOUT_MS?: string }).PRESENCE_TIMEOUT_MS ?? '')
    return override > 0 ? override : PRESENCE_TIMEOUT_MS
  }

  /** An open socket whose last heartbeat (runtime-answered ping, or the open
   *  itself for a socket too young to have pinged) is recent enough to count. */
  private fresh(ws: WebSocket): boolean {
    const opened = (ws.deserializeAttachment() as { openedAt?: number } | null)?.openedAt ?? 0
    const beat = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? opened
    return Date.now() - beat < this.presenceTimeoutMs()
  }

  /** Live-socket presence. Ephemeral by design: computed from the accepted
   *  sockets (which survive hibernation), never stored, never in revision.
   *  Broadcasts still go to every open socket — freshness only decides who
   *  counts as sitting here. */
  private presence(): Presence {
    return {
      p1: this.socketsFor('p1').some((ws) => this.fresh(ws)),
      p2: this.socketsFor('p2').some((ws) => this.fresh(ws)),
    }
  }

  /** The redaction boundary: tokens are never part of a view. */
  private viewFor(m: StoredMatch, you: PlayerId): MatchView {
    return {
      code: m.code,
      you,
      state: m.state,
      revision: m.revision,
      lastEvent: m.lastEvent ?? null,
      presence: this.presence(),
    }
  }

  /** A redacted one-row snapshot for the lobby. Whose turn it is comes from
   *  nextActor(); while a seat is empty the opponent fields stay blank. */
  private summaryFor(m: StoredMatch, you: PlayerId): MatchSummary {
    const s = m.state
    const opp = opponentOf(you)
    const awaiting = !!s.awaitingOpponent
    return {
      code: m.code,
      you,
      yourName: s.players[you].name,
      opponentName: awaiting ? null : s.players[opp].name,
      phase: s.phase,
      yourTurn: this.nextActor(m) === you,
      awaitingOpponent: awaiting,
      yourScore: s.players[you].points,
      opponentScore: awaiting ? 0 : s.players[opp].points,
      winner: s.winner,
      lastMoveAt: m.lastMoveAt ?? null,
      opponentPresent: this.presence()[opp],
      openingWord: s.chain[0]?.word ?? null,
    }
  }

  /** Push each player their own view down any sockets they have open. Sends
   *  can race a closing socket; a failed send is fine — that client will
   *  reconnect or fall back to polling and resync by revision. */
  private broadcast(m: StoredMatch): void {
    for (const you of ['p1', 'p2'] as const) {
      const sockets = this.socketsFor(you)
      if (sockets.length === 0) continue
      const push: SocketPush = { type: 'view', view: this.viewFor(m, you) }
      const data = JSON.stringify(push)
      for (const ws of sockets) {
        try {
          ws.send(data)
        } catch {
          // Socket died between getWebSockets and send — polling covers it.
        }
      }
    }
  }

  /**
   * GET /api/match/:code/ws?token=… — the live line to the table. Browsers
   * can't set headers on WebSockets, so the token rides the query string
   * (wss-encrypted; same secret the HTTP API already requires). Downstream
   * only: every push is a full view, moves stay on HTTP.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket')
      return Response.json({ ok: false, error: 'Expected a WebSocket upgrade.' }, { status: 426 })
    const m = await this.load()
    if (!m) return Response.json({ ok: false, error: 'No match with that code.' }, { status: 404 })
    const token = new URL(request.url).searchParams.get('token') ?? ''
    const you = this.identify(m, token)
    if (!you)
      return Response.json(
        { ok: false, error: "This device isn't part of that match." },
        { status: 403 },
      )

    const pair = new WebSocketPair()
    // The player tag lets broadcast() and presence() find this socket after
    // hibernation; the attachment survives eviction alongside it.
    this.ctx.acceptWebSocket(pair[1], [you])
    // openedAt seeds the freshness clock until the first ping lands.
    pair[1].serializeAttachment({ you, openedAt: Date.now() })
    // Everyone (including the newcomer) gets a fresh view: the newcomer's
    // initial sync and the opponent's "they're at the table" in one move.
    this.broadcast(m)
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  /** Upstream traffic is only the heartbeat, which the auto-responder eats.
   *  Anything else is a confused client; ignore it rather than crash. */
  async webSocketMessage(): Promise<void> {}

  private vapid(): VapidConfig | null {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = this.env
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return null // keys not provisioned
    return {
      publicKey: VAPID_PUBLIC_KEY,
      privateKey: VAPID_PRIVATE_KEY,
      subject: VAPID_SUBJECT || 'https://shifty-type.heymatthewoden.workers.dev',
    }
  }

  /** Register (or clear, with null) this player's Web Push subscription. */
  async setPush(
    token: string,
    sub: PushSubscriptionJSON | null,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const m = await this.load()
    if (!m) return { ok: false, error: 'No match with that code.' }
    const you = this.identify(m, token)
    if (!you) return { ok: false, error: "This device isn't part of that match." }
    if (
      sub !== null &&
      !(
        typeof sub?.endpoint === 'string' &&
        sub.endpoint.startsWith('https://') &&
        sub.endpoint.length < 1024 &&
        typeof sub.keys?.p256dh === 'string' &&
        typeof sub.keys?.auth === 'string' &&
        sub.keys.p256dh.length < 256 &&
        sub.keys.auth.length < 256
      )
    )
      return { ok: false, error: "That doesn't look like a push subscription." }
    const subs = (await this.ctx.storage.get<PushSubs>('push')) ?? {}
    if (sub) subs[you] = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }
    else delete subs[you]
    await this.ctx.storage.put('push', subs)
    return { ok: true }
  }

  /** Whose move is it? Null only for terminal phases. While awaiting a friend
   *  the phase already names the opener's seat, so no special case is needed. */
  private nextActor(m: StoredMatch): PlayerId | null {
    const s = m.state
    if (s.phase === 'P1_TURN') return 'p1'
    if (s.phase === 'P2_TURN') return 'p2'
    if (s.phase === 'LAST_CALL') return lastCallActorOf(s)
    return null
  }

  /** Fire-and-forget Web Push to one player. A push must never slow down or
   *  fail whatever triggered it; dead subscriptions self-prune. */
  private pushTo(recipient: PlayerId, payload: NudgePayload): void {
    const vapid = this.vapid()
    if (!vapid) return
    this.ctx.waitUntil(
      (async () => {
        const subs = (await this.ctx.storage.get<PushSubs>('push')) ?? {}
        const sub = subs[recipient]
        if (!sub) return
        if ((await sendPush(sub, payload, vapid)) === 'gone') {
          delete subs[recipient] // uninstalled or revoked — stop knocking
          await this.ctx.storage.put('push', subs)
        }
      })().catch(() => {}),
    )
  }

  /** Nudge whoever must act next — unless they're the one who just acted or
   *  they're watching on a live socket. */
  private nudge(m: StoredMatch, actor: PlayerId, body?: string): void {
    const recipient = this.nextActor(m) ?? opponentOf(actor) // terminal: tell the other player
    if (recipient === actor) return
    if (this.presence()[recipient]) return
    this.pushTo(recipient, { title: 'Shifty Type', body: body ?? nudgeBody(m), code: m.code })
  }

  async webSocketClose(): Promise<void> {
    const m = await this.load()
    if (m) this.broadcast(m) // presence dropped — tell whoever's still seated
  }

  async webSocketError(): Promise<void> {
    const m = await this.load()
    if (m) this.broadcast(m)
  }

  private identify(m: StoredMatch, token: string): PlayerId | null {
    if (token && m.tokens.p1 === token) return 'p1'
    if (token && m.tokens.p2 === token) return 'p2'
    return null
  }

  async create(code: string, name: string): Promise<CreateResponse> {
    if (await this.load()) return { ok: false, error: 'exists' }
    const token = crypto.randomUUID()
    const m: StoredMatch = {
      code,
      state: newMatchState(name),
      tokens: { p1: token, p2: null },
      opener: 'p1',
      revision: 0,
    }
    await this.persist(m)
    return { ok: true, code, token, view: this.viewFor(m, 'p1') }
  }

  async join(name: string): Promise<JoinResponse> {
    const m = await this.load()
    if (!m) return { ok: false, error: 'No match with that code.' }
    if (m.tokens.p2 !== null) return { ok: false, error: 'That match already has two players.' }
    const token = crypto.randomUUID()
    m.tokens.p2 = token
    m.state = joinMatch(m.state, name)
    await this.persist(m)
    this.broadcast(m) // the opener may be watching for their friend on a live socket
    // Tell the creator their friend arrived (they may have opted into the bell
    // and closed the app). Turn nudges then follow real play. Skipped if the
    // creator is watching live. The creator always holds the p1 seat.
    if (!this.presence().p1)
      this.pushTo('p1', {
        title: 'Shifty Type',
        body: `${m.state.players.p2.name} joined the game.`,
        code: m.code,
      })
    return { ok: true, token, view: this.viewFor(m, 'p2') }
  }

  /** Non-secret match facts for the invite landing: who invited you, the word
   *  already on the table, and whether a seat is still free. No token needed. */
  async preview(): Promise<PreviewResponse> {
    const m = await this.load()
    if (!m) return { ok: false, error: 'No match with that code.' }
    const s = m.state
    const terminal = s.phase === 'GAME_OVER' || s.phase === 'CHAIN_COMPLETE'
    return {
      ok: true,
      creatorName: s.players.p1.name,
      openingWord: s.chain[0]?.word ?? null,
      joinable: m.tokens.p2 === null && !terminal,
    }
  }

  async getView(token: string, since?: number): Promise<GetResponse> {
    const m = await this.load()
    if (!m) return { ok: false, error: 'No match with that code.' }
    const you = this.identify(m, token)
    if (!you) return { ok: false, error: "This device isn't part of that match." }
    if (since !== undefined && since === m.revision)
      return { ok: true, unchanged: true, presence: this.presence() }
    return { ok: true, view: this.viewFor(m, you) }
  }

  /** One lobby row. 'gone' means the match is deleted (prune the dead seat);
   *  'forbidden' means the token doesn't match (leave the seat, don't prune). */
  async summary(
    token: string,
  ): Promise<{ ok: true; summary: MatchSummary } | { ok: false; error: 'gone' | 'forbidden' }> {
    const m = await this.load()
    if (!m) return { ok: false, error: 'gone' }
    const you = this.identify(m, token)
    if (!you) return { ok: false, error: 'forbidden' }
    return { ok: true, summary: this.summaryFor(m, you) }
  }

  async move(token: string, clientMove: ClientMove): Promise<MoveResponse> {
    const m = await this.load()
    if (!m) return { ok: false, error: 'No match with that code.' }
    const actor = this.identify(m, token)
    if (!actor) return { ok: false, error: "This device isn't part of that match." }

    let engineMove: Move
    switch (clientMove.type) {
      case 'play':
        engineMove = { type: 'play', word: String(clientMove.word ?? '') }
        break
      case 'pass':
        engineMove = { type: 'pass' }
        break
      case 'accept':
        // Shaking on the final word needs no referee — the chain stands.
        engineMove = { type: 'accept' }
        break
      case 'challenge': {
        // The DO is the referee: resolve the verdict now (embedded list →
        // dictionary API) and apply the instant STANDS/REJECTED outcome. If
        // the referee can't be reached, nothing changes and the challenger
        // can flag it again once they're back online.
        const word = m.state.chain[m.state.chain.length - 1]?.word
        if (!word) return { ok: false, error: 'Nothing to challenge yet.' }
        const verdict = await lookupWord(word)
        if (verdict === 'unknown')
          return {
            ok: false,
            error: "Couldn't get a ruling just now — check your connection and flag it again.",
          }
        engineMove = { type: 'challenge', wordIsReal: verdict === 'real' }
        break
      }
      default:
        return { ok: false, error: 'Unknown move.' }
    }

    const accusedWord = m.state.chain[m.state.chain.length - 1]?.word ?? ''
    const wasBroken = isChainBroken(m.state)
    const r = applyMove(m.state, actor, engineMove)
    if (!r.ok) return { ok: false, error: r.error }
    m.state = r.state
    switch (engineMove.type) {
      case 'play':
        m.lastEvent = {
          kind: 'play',
          word: r.state.chain[r.state.chain.length - 1].word,
          by: actor,
        }
        break
      case 'pass':
        // The second pass in a row snaps the chain — the event carries it so
        // clients and nudges can narrate the fresh start.
        m.lastEvent = {
          kind: 'pass',
          by: actor,
          ...(isChainBroken(r.state) && !wasBroken ? { snapped: true } : {}),
        }
        break
      case 'accept':
        m.lastEvent = { kind: 'accept', word: accusedWord, by: actor }
        break
      case 'challenge':
        m.lastEvent = {
          kind: engineMove.wordIsReal ? 'real' : 'fake',
          word: accusedWord,
          by: actor,
        }
        break
    }
    await this.persist(m)
    this.broadcast(m)
    this.nudge(m, actor)
    return { ok: true, view: this.viewFor(m, actor) }
  }

  async rematch(token: string): Promise<MoveResponse> {
    const m = await this.load()
    if (!m) return { ok: false, error: 'No match with that code.' }
    const actor = this.identify(m, token)
    if (!actor) return { ok: false, error: "This device isn't part of that match." }
    if (m.state.phase !== 'GAME_OVER' && m.state.phase !== 'CHAIN_COMPLETE')
      return { ok: false, error: "The match isn't over yet." }
    m.opener = opponentOf(m.opener)
    m.state = newMatchState(m.state.players.p1.name, m.state.players.p2.name, m.opener)
    m.lastEvent = { kind: 'rematch', by: actor }
    await this.persist(m)
    this.broadcast(m)
    this.nudge(m, actor)
    return { ok: true, view: this.viewFor(m, actor) }
  }

  async ping(): Promise<{ ok: true }> {
    return { ok: true }
  }

  /**
   * Two-stage silence handling. Stage one (a week idle): one quiet-match
   * reminder to whoever's holding things up, then re-arm. Stage two (60 days
   * from the last move): the match is deleted. Any move resets to stage one.
   */
  async alarm(): Promise<void> {
    const m = await this.load()
    if (!m || m.reminded) {
      await this.ctx.storage.deleteAll()
      return
    }
    m.reminded = true
    // Raw put, not persist(): the flag is bookkeeping, not a state change —
    // no revision bump, no reminder re-arm.
    await this.ctx.storage.put('match', m)
    await this.ctx.storage.setAlarm(Date.now() + Math.max(0, MATCH_TTL_MS - REMIND_AFTER_MS))
    const s = m.state
    if (s.phase === 'GAME_OVER' || s.phase === 'CHAIN_COMPLETE') return // nothing to come back for
    // While a seat is still empty, the only person to remind is the creator
    // (nextActor may name the unfilled seat) — nudge them to send the invite.
    if (s.awaitingOpponent) {
      if (this.presence().p1) return
      this.pushTo('p1', {
        title: 'Shifty Type',
        body: 'Your match is still open — invite a friend to join in.',
        code: m.code,
        tag: 'quiet-matches',
      })
      return
    }
    const recipient = this.nextActor(m)
    if (!recipient || this.presence()[recipient]) return // seated players need no reminding
    this.pushTo(recipient, {
      title: 'Shifty Type',
      body: `Your match with ${s.players[opponentOf(recipient)].name} has gone quiet — they're waiting on your move.`,
      code: m.code,
      tag: 'quiet-matches',
    })
  }
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function cleanName(raw: unknown): string {
  const name = String(raw ?? '').trim().slice(0, 20)
  return name || 'Anonymous'
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request) // the built client
    }

    // The applicationServerKey clients subscribe with. Public by definition.
    if (pathname === '/api/push/key') {
      return json({ ok: true, key: env.VAPID_PUBLIC_KEY ?? null })
    }

    if (pathname === '/api/health') {
      const stub = env.MATCH_DO.get(env.MATCH_DO.idFromName('health-check'))
      const pong = await stub.ping()
      return json({ ok: true, worker: 'shifty-type', matchDO: pong })
    }

    // POST /api/match — create a match, retrying on code collision
    if (pathname === '/api/match' && request.method === 'POST') {
      const body = await readBody(request)
      const name = cleanName(body.name)
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode()
        const stub = env.MATCH_DO.get(env.MATCH_DO.idFromName(code))
        const res = await stub.create(code, name)
        if (res.ok) return json(res)
      }
      return json({ ok: false, error: 'Could not find a free match code — try again.' }, 500)
    }

    // POST /api/matches/summary — the lobby's one batched read. Body carries
    // the {code, token} seats the client already holds; we fan out to each DO.
    if (pathname === '/api/matches/summary' && request.method === 'POST') {
      const body = await readBody(request)
      const rawList = Array.isArray(body.matches) ? body.matches : []
      const seats = rawList
        .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
        .filter((x) => typeof x.code === 'string' && typeof x.token === 'string')
        .map((x) => ({ code: (x.code as string).toUpperCase(), token: x.token as string }))
        .filter((x) => /^[A-Z0-9]{4}$/.test(x.code))
        .slice(0, 100) // a friends-and-family device won't hold more; caps abuse
      const results = await Promise.all(
        seats.map(async (seat) => {
          try {
            const stub = env.MATCH_DO.get(env.MATCH_DO.idFromName(seat.code))
            return { seat, res: await stub.summary(seat.token) }
          } catch {
            return { seat, res: { ok: false, error: 'forbidden' } as const } // infra hiccup: don't prune
          }
        }),
      )
      const summaries: MatchSummary[] = []
      const gone: string[] = []
      for (const { seat, res } of results) {
        if (res.ok) summaries.push(res.summary)
        else if (res.error === 'gone') gone.push(seat.code)
      }
      return json({ ok: true, summaries, gone })
    }

    const match = pathname.match(
      /^\/api\/match\/([A-Za-z0-9]{4})(?:\/(join|move|rematch|ws|push|preview))?$/,
    )
    if (!match) return json({ ok: false, error: 'Not found' }, 404)
    const code = match[1].toUpperCase()
    const action = match[2]
    const stub = env.MATCH_DO.get(env.MATCH_DO.idFromName(code))
    const token = request.headers.get('x-match-token') ?? ''

    // The live line: hand the upgrade straight to the DO's fetch handler.
    if (action === 'ws') return stub.fetch(request)

    // Public invite preview — no token, safe non-secret fields only.
    if (action === 'preview' && request.method === 'GET') {
      const res = await stub.preview()
      return json(res, res.ok ? 200 : 404)
    }

    if (!action && request.method === 'GET') {
      const sinceRaw = url.searchParams.get('since')
      const since = sinceRaw === null ? undefined : Number(sinceRaw)
      const res = await stub.getView(token, Number.isFinite(since as number) ? since : undefined)
      return json(res, res.ok ? 200 : 404)
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'Not found' }, 404)

    if (action === 'join') {
      const body = await readBody(request)
      const res = await stub.join(cleanName(body.name))
      return json(res, res.ok ? 200 : 400)
    }
    if (action === 'move') {
      const body = await readBody(request)
      const res = await stub.move(token, body.move as ClientMove)
      return json(res, res.ok ? 200 : 400)
    }
    if (action === 'rematch') {
      const res = await stub.rematch(token)
      return json(res, res.ok ? 200 : 400)
    }
    if (action === 'push') {
      const body = await readBody(request)
      const res = await stub.setPush(
        token,
        (body.subscription ?? null) as PushSubscriptionJSON | null,
      )
      return json(res, res.ok ? 200 : 400)
    }
    return json({ ok: false, error: 'Not found' }, 404)
  },
} satisfies ExportedHandler<Env>
