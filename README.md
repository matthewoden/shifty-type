# Shifty Type

An async two-player word game about overlapping words and sneaky typos. Play it at **https://shifty-type.heymatthewoden.workers.dev** — no account, no install required (though the full feature set comes when you do the PWA install). Developed with claude while recovering in the hospital.

https://github.com/user-attachments/assets/4dac3249-922a-4df2-b6ff-3695ea8e9876

_A solo match against Lloyd ([source video](docs/demo.mp4))._

You and a friend build one chain of words across the table. Each word must **start with the last 2+ letters of the word before it**:

```
vault → ultra → radish
        ^^^      ^^
    overlap ULT  overlap RA
```

The shared letters are the overlap, which is where most of your points come from. Scoring is handled as overlap \* overlap + (wordlength - overlap).

## What's with the llamas?

An earlier iteration of this game at one point was called "Spell Llamas". But after a while, I gave up trying to land a "wizardly llama" aesthetic, and changed the name.

The llamas were created for that, and I couldn't bring myself to rename them.

## The rules, briefly

- **Play a word** that overlaps the last 2+ letters of the previous word and adds at least 2 letters of its own. 3–40 letters, no repeats within a match.
- **Points** = overlap² + 1 per letter past the overlap. Overlap 2 is worth 4; overlap 5 is worth 25. Long words earn their length. Openers (the first word, or a fresh chain) pay 1 point per letter.
- **Nobody checks your word when you play it.** Bluffing is legal. Getting caught is not.
- **The flag:** instead of playing, you can challenge the word your friend just played. The referee rules on the spot — **STANDS** (it's real; you lose a life for the bad call) or **REJECTED** (it's fake; the word is struck, its owner loses a life, and you play on from the word before it).
- **Lives:** 3 each. Lose them to rejected words, failed challenges, or passing when you're stuck. If you both pass on the same word, the chain snaps and whoever's up starts a fresh chain.
- **Match end:** run a player out of lives and they lose outright. Otherwise the chain completes at 20 words — but the 20th word faces **last call**: the other player gets one closing move, shake on it or challenge it. Then highest points wins.

## Solo mode

No friend handy? Play a llama. **Lloyd** (mellow), **Llois** (curious), and **Llarry** (unhinged) play from a list of common English words with increasing greed for deep overlaps — and Llarry will occasionally bluff you with a plausible fake. Solo mode works fully offline.

## Multiplayer

Matches are async and unhurried — no timers, and a match keeps for weeks. Create a match, play your opening word, and share the 4-character code with a friend however you like. They join, play, and the game nudges whoever's up next (optional Web Push "bell", plus live updates while you're both watching). Nobody logs in; your device remembers who you are.

## For developers

### Stack

- **Client:** React + Vite + TypeScript + Tailwind, built as a PWA (installable, solo mode offline).
- **Backend:** a single Cloudflare Worker serves the static frontend and a small JSON API. Each match lives in its own SQLite-backed **Durable Object**, which is the sole referee and the only writer of match state.
- **Game logic:** everything — chain validation, scoring, challenge resolution, the bots — lives in `src/game/` as dependency-free pure functions, imported by both the React client and the Durable Object. No game rules inside components.
- **Dictionary:** words are only checked when challenged, via the embedded common-word list first, then the [Free Dictionary API](https://dictionaryapi.dev) (called server-side by the referee).
- **Push:** Web Push is sent directly from the Durable Object via `src/worker/webpush.ts`, a dependency-free VAPID + aes128gcm implementation.

### Layout

```
src/game/       pure game engine + bots + word list (unit-tested; keep dependency-free)
src/worker/     Cloudflare Worker: API routes, Durable Object, Web Push
src/components/ shared UI
src/solo/       solo mode (runs the engine locally)
src/multi/      multiplayer client (HTTP moves + hibernating WebSocket updates)
src/screens/    top-level screens
src/sw.ts       custom service worker (precache, push, badges)
```

### Commands

```sh
npm install
npm run dev        # local dev server
npm run test       # vitest — game logic must stay green
npm run typecheck  # app + worker + service worker tsconfigs
npm run deploy     # build + deploy to the staging Worker (env "next")
npm run promote    # deploy to production (shifty-type)
```

Deploys are two-stage: `deploy` goes to staging, `promote` ships the same build to production. `VAPID_PRIVATE_KEY` is a Worker secret (use `.dev.vars` locally); the public key and subject live in `wrangler.jsonc`.

### Before you change anything

Read `GAME_DESIGN.md` — the rules, scoring, and challenge mechanic are settled, and the design rationale for each is written down there. `CLAUDE.md` records the project conventions and the decisions already made (including the copy voice: silly card-table, the other player is always a _friend_).
