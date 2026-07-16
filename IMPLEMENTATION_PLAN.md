# Implementation Plan

Build in phases. Every phase ends with something playable. Don't start a phase until the previous one's acceptance criteria pass.

## Phase 0 — Scaffold
- Vite + React + TS + Tailwind + vitest. PWA manifest stub.
- Wrangler config with Workers Assets + a stub `MatchDO` Durable Object binding (health-check route only for now).
- `src/game/` module with types: `MatchState`, `Move`, `Player`, `ChainLink` — dependency-free, importable from both client and Worker.
- **Done when:** `npm run dev` shows a placeholder home screen served through `wrangler dev`; `npm run test` runs.

## Phase 1 — Game engine (pure logic, no UI)
- `applyMove()` state machine covering play / pass / challenge / fold / stand.
- Overlap validation (2+ letters, suffix-prefix match, no repeats, regex guard).
- Scoring: overlap² + length bonus; points refund on removed words; chain rewind on fold/failed-stand.
- Life accounting; win/end conditions (lives = 0, chain = 20, tiebreaks).
- **Tests are the deliverable.** Cover at minimum: `ultra→ultramarine` overlap-5 case, repeat rejection, fold rewind (next player continues from *previous* word), points refund math, chain-complete tiebreaks, challenging only the latest word.
- **Done when:** engine tests green; a scripted match can be replayed from a move list.

## Phase 2 — Solo mode
- Embed word list (`wordlist.ts`, ~2,000 common words). Source from a frequency list; lowercase; no proper nouns.
- Bot per GAME_DESIGN.md §Solo: suffix-indexed lookup (build a prefix map at load), greed-based difficulty, challenge probabilities, Hard-mode bluffs.
- Match screen UI: chain ledger with hanging-overlap visual, sticky input bar, lives + points HUD, challenge interstitial.
- **Done when:** a full solo match is playable and losable on a phone-width viewport, including a bot bluff getting caught.

## Phase 3 — Multiplayer
- Wrangler project: one Worker serving the built client via Workers Assets + `/api/*` routes; `MatchDO` Durable Object class (SQLite-backed) bound in `wrangler.toml`.
- DO endpoints: create (mints code + creator token), join (claims slot, mints token), move (token-gated, runs shared `applyMove()`), get (version-aware poll, redacts opponent token).
- Client: visibility-aware 8s polling while waiting; "your rival played AXOLOTL" toast on update; `/m/CODE` deep link resume with stored token.
- Challenge resolution in the Worker: embedded list → dictionaryapi.dev fetch → coin-flip fallback.
- 60-day inactivity alarm for match cleanup.
- Local dev must work fully offline via `wrangler dev` (miniflare simulates the DO).
- **Done when:** two phones can complete a deployed match including a challenge resolved by the dictionary API, a mid-match phone refresh resumes cleanly, and a move sent with a bad token is rejected.

## Phase 4 — Polish
- Visual pass to match `mockups/threes-v2-rail.html` exactly: palette, chiclet tiles with hard bottom lips, tint-joint rendering, player color coding, turn pill.
- Camera rail per GAME_DESIGN.md §The ledger camera: native scroll driving the canvas transform along the row-anchor polyline, "Back to latest" pill, reduced-motion flat-list fallback.
- Challenge interaction: ⚖ tag on the opponent's newest word, tap → confirm sheet → challenge; REAL/FAKE stamp on the verdict.
- Game-over screen: points count-up bars in player colors, chain replay, rematch (swaps opener).
- PWA: installable, solo mode fully offline, app icon.
- Empty/error states in-voice; reduced-motion audit; 44px touch audit; verify the four tile values (blue, pale blue, red, pale red) stay distinguishable at low screen brightness.
- **Done when:** Lighthouse mobile perf ≥ 90, installs to home screen, and the ledger scroll feels like riding the chain, not fighting it.

## Explicitly out of scope (v1)
Push notifications, accounts, spectators, match history, profanity filter, sounds beyond stubs.
