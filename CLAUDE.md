# Shifty Type

Async two-player word game (plus solo vs the llama bot). Renamed 2026-07 from "Word Chain" to "Spell Llama", then to **Shifty Type** — the name plays the game's own move (SHIFTY → TYPE, overlap TY; fused: SHIFTYPE) and means the sneak across the table. The bot remains Lloyd the llama. Full de-heist of all copy at the same time: the voice is silly card-table, never crime (no vault/heist/thieves/stash/hideout). The other player is always a **friend** — never "rival"/"rivals" (or opponent-hostile framing) anywhere in user-facing copy, notifications included. Deployed at **https://shifty-type.heymatthewoden.workers.dev** (Worker renamed 2026-07-12; the old word-chain Worker and its matches were deleted). Mobile-first web app. The player is currently in the hospital and will play primarily on a phone, in short sessions, possibly on flaky wifi — treat mobile performance, resumability, and offline-tolerance as first-class requirements.

## Read these first
- `GAME_DESIGN.md` — rules, scoring, challenge mechanic, bot behavior, visual direction. The rules are settled; do not redesign them without asking.
- `IMPLEMENTATION_PLAN.md` — phased milestones with acceptance criteria. Build in order; each phase should be playable.
- `mockups/threes-v2-rail.html` — the visual reference for Phase 4. This is the chosen direction (Threes-inspired chiclets, indigo/coral player coding, tint joints, camera rail); match it. `mockups/keyboard-deck.html` is the newer reference for the input interaction (custom key deck, inline play, parked camera, grip fan) — it supersedes the input-bar spec. `mockups/explorations/` is rejected history — do not draw from it.

## Stack
- React + Vite + TypeScript
- Tailwind for styling
- Cloudflare Workers (free tier) for the multiplayer backend, deployed with wrangler. One Worker serves both the static frontend (Workers Assets) and a small JSON API. Match state lives in a **Durable Object per match** (SQLite-backed, available on the free plan) — NOT Workers KV, whose eventual consistency can lose alternating-turn writes. See GAME_DESIGN.md §Multiplayer.
- Chosen specifically because the free tier has **no inactivity pausing** — this game may sit untouched for weeks and must still work.
- PWA manifest + service worker so it installs to the phone home screen and solo mode works offline
- Free Dictionary API (`https://api.dictionaryapi.dev/api/v2/entries/en/{word}`) for challenge resolution (called from the Worker, not the client), with the embedded word list as fallback

## Conventions
- All game logic (chain validation, scoring, challenge resolution, bot) lives in `src/game/` as pure functions with unit tests. No game rules inside React components. The same module is imported by both the React client (solo mode, optimistic UI) and the Durable Object (authoritative multiplayer moves) — keep it dependency-free so it runs in both runtimes.
- The embedded word list lives in `src/game/wordlist.ts` (~2,000 common English words, lowercase). Bot plays only from this list.
- State machine for a match is explicit (see GAME_DESIGN.md §States). Never mutate match state ad hoc — every transition goes through `applyMove()`.
- Touch targets ≥ 44px. Test at 375px width first.
- Keep the bundle small; no heavy dependencies for animation (CSS transitions are fine).

## Commands
- `npm run dev` — local dev (`wrangler dev` for the Worker + Vite for the client, wired together)
- `npm run test` — vitest (game logic must stay green)
- `npm run deploy` — build client + `wrangler deploy`

## Known constraints / decisions already made
- No login. Players are identified by a per-device ID stored in localStorage + a display name. Matches are joined by 4-character code. Each player gets a random secret token on join; the Durable Object rejects moves without the right token, so knowing a match code alone doesn't let strangers play your turns.
- The Durable Object is the referee: it runs `applyMove()` and is the only writer of match state. The client never writes state directly.
- Words played are NOT auto-validated against a dictionary — bluffing is a core mechanic. The dictionary is only consulted when a word is challenged.
- Turns are async: no timers, matches persist for weeks. Live updates ride a hibernating WebSocket per player (DO Hibernation API — tagged sockets, per-player view pushes, `ping`/`pong` auto-response so heartbeats don't wake the DO). Moves stay on HTTP POST. Polling (8s, visible tab, not the player's turn) is the fallback when the socket is down; both paths dedupe on `revision`. Presence (`view.presence`) is ephemeral — computed from open sockets, never stored, never bumps `revision`.
- Web Push ("nudges") is sent directly from the Durable Object — no third-party push service. `src/worker/webpush.ts` is a dependency-free VAPID + aes128gcm implementation (WebCrypto only, unit-tested against the RFC 8291 vector). Subscriptions are stored per player per match under the DO's `push` storage key (never in views/revision); dead subscriptions (404/410) self-prune. The nudge goes to whoever must act next, skipped when they're watching on a live socket. The match alarm is two-stage: after 7 days of silence, one reminder nudge ("your match has gone quiet") goes to whoever must act — once per quiet spell, any move resets it; after 60 days the match is deleted as before. Reminders share the notification tag `quiet-matches`, and the service worker merges same-day pile-ups into one card with a count (at most one buzz). `.dev.vars` can set `REMINDER_DELAY_MS` to test the alarm chain locally. Keys: `VAPID_PUBLIC_KEY`/`VAPID_SUBJECT` are vars in wrangler.jsonc (duplicated into env.next — vars don't inherit); `VAPID_PRIVATE_KEY` is a Worker secret on both Workers + `.dev.vars` locally. The service worker is custom (`src/sw.ts`, vite-plugin-pwa injectManifest): precache + SPA fallback as before, plus push/notificationclick/app-badge handlers. In-game copy calls it "ringing the bell" (Phosphor call-bell icon); on iOS it only works in the installed PWA, which is the install card's main sell.
- Free-tier awareness: Workers free plan ≈ 100K requests/day and Durable Objects have their own daily free limits — fine for a friends-and-family game, but don't add chatty polling or per-keystroke API calls.
