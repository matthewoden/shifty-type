# Shifty Type — Game Design

> Renamed from "Word Chain" and fully de-heisted, 2026-07 (Matt's call). Voice: silly, warm, card-table — bluff/busted/accuse/ruling/stands/rejected are game words; vault/heist/thieves/stash/accomplice/hideout are banned. Scores are **points ("pts")** everywhere — UI, code, and this doc (renamed 2026-07-16 from the old "gold"). The bot is a llama — one per mood: **Lloyd** (Mellow/easy), **Llois** (Curious/medium), **Llarry** (Unhinged/hard). Name updated again 2026-07-12: **Shifty Type** (SHIFTY → TYPE, grip TY, fused SHIFTYPE — see mockups/name-board.html); logo remains "the stair" with the new words.

Two players build one chain of overlapping words. Shared letters are the joints — riskier overlaps earn more points. Bluffing is legal; getting caught is not.

## Core loop

Players alternate turns. On your turn you either **play a word** or **challenge** the previous word.

### Playing a word

- Your word must **start with the last 2+ letters** of the previous word.
    - `vault` → `ultra` (overlap **ult**, 3) → `radish` (overlap **ra**, 2)
- Minimum word length: 3. Minimum overlap: 2. Max overlap: full previous word minus 1 (you can't just replay the word with letters added in front — actually you can, if the previous word is a proper prefix of yours: `ultra` → `ultramarine` is legal and glorious, overlap 5).
- **No word may repeat within a match** (case-insensitive).
- Words are NOT dictionary-checked when played. Anything matching `^[a-z]{3,}$` with a valid overlap is accepted onto the chain. This is deliberate: bluffing is the game.

### Points (scoring — shown as "pts")

- Points taken = **overlap² + max(0, wordLength - overlap)**.
    - Overlap 2 → 4. Overlap 3 → 9. Overlap 4 → 16. Overlap 5 → 25.
    - Length bonus: +1 per letter beyond 6 (`ultramarine` = 25 + 5 = 30).
- Rationale: quadratic overlap makes the risky play dramatically better, which is what forces bluffs.

### Lives

Each player starts with **3 lives** (rendered as pips in the player's color). You lose a life when:

1. A word of yours is **REJECTED** under a challenge — the challenger proved it fake, and it's removed from the chain.
2. Your **challenge fails** — the word you accused **STANDS** (it was real).
3. You **pass** because you're stuck. (Passing also skips your points for the turn; opponent continues from the same word.)

### The challenge (signature mechanic)

Instead of playing, you may challenge the word your opponent just played (only the most recent word is challengeable). It resolves **on the spot** — there is no defender fold/stand step (removed 2026-07: folding and a failed stand had identical outcomes, so the defender's "choice" was pure async delay).

**Interaction (FINAL):** the challenge does NOT live in the deck — the deck's only job is playing your word. The opponent's newest word carries a small flag tag on its row; tapping the word opens a confirm sheet ("Challenge this word? Incorrect answers lose a life."). Confirm, and the referee rules immediately:

- Word is in the embedded common-word list → **real**, instantly (offline-safe).
- Otherwise → Free Dictionary API lookup.
- API unreachable → **error** ("Couldn't get a ruling just now — check your connection and flag it again."). Nothing changes, no life lost; the challenger can flag it again. (Solo: a _bot_-initiated challenge that can't reach the referee is quietly dropped — the bot takes a normal turn instead, so solo stays fully playable offline and never rules on a word the referee hasn't seen.)

The verdict is a state stamped on the word; either way the challenger is on move next:

- **STANDS** (real) — the word keeps its place and its points; the **challenger** loses a life for the bad call. Blue-grey stamp (`p1-lip`).
- **REJECTED** (fake) — the word is removed, its points refunded, the chain rewinds one link, and the **word's owner** loses a life; the challenger plays from the previous word. Red stamp (always red — a word died, whoever played it).

### Match end

A match ends when either player is out of lives (**opponent wins outright, points irrelevant**), or when the chain reaches **20 words** ("the chain is complete") — then **highest points wins**. Ties broken by remaining lives, then by longest single word played.

**Last call (added 2026-07-16, see mockups/last-call.html):** the 20th word does NOT end the match on the spot — that made the final word a free, unchallengeable bluff aimed straight at the points win (and the other player never even saw it land). Instead the chain filling opens `LAST_CALL`: the player who didn't play the final word gets exactly one closing move — **accept** ("shake on it" → chain complete) or **challenge** it, under the normal challenge rules. STANDS → the caller pays the usual life and the chain completes (the spent life can swing a points tie); REJECTED → the fake is struck, its owner pays the life, the chain rewinds to 19, and the challenger plays on until someone's 20th word survives or gets the handshake. In the UI the deck gives way to a last-call bar (coral "Shake on it" pill, Phosphor handshake), the HUD's countdown chip reads LAST CALL, and the turn nudge says "shake on it or challenge."

### Opening move

Player 1's first word can be anything (3+ letters). Show a "pick your entry point" framing.

## Solo mode: vs. Lloyd the llama

Same rules vs a bot. Bot behavior:

- Plays only from the embedded word list; picks by searching words starting with each possible overlap suffix of the current word (longest overlap first).
- **Difficulty via greed**: Easy bot takes the first valid 2-overlap word. Hard bot maximizes overlap² and prefers long words.
- Bot challenge logic: challenges the player's word with probability that scales when the word is NOT in the embedded list — Easy: 15%, Medium: 40%, Hard: 75%. Never challenges words in the list. The bot never _defends_ — challenges resolve instantly, and a bot challenge is ruled by the **same referee as a player's** (embedded list, then dictionary API), so the bot loses a life when it flags a real word it doesn't know. If the referee is unreachable, the bot drops the flag and plays a normal turn (offline-safe; changed 2026-07 — it previously ruled list-only, which meant every bot challenge auto-won and real words like "convoluted" got struck). At last call the same logic answers for the bot: its usual challenge roll on the player's final word, otherwise (including a dropped flag) it shakes. Tutorial Lloyd never challenges, so he always shakes.
- Bot never bluffs on Easy/Medium. On Hard, 10% of the time when stuck it plays a plausible fake (list word + common suffix like "-ry", "-ish") instead of passing. This is the fun part — don't cut it.
- Bot moves resolve after a 1–2s "thinking" delay with a little animation.

## Multiplayer

- Create match → 4-char code (unambiguous alphabet, no 0/O/1/I). Share code out-of-band (text message).
- One Cloudflare **Durable Object per match**, addressed by `idFromName(code)`. It holds the full `MatchState` in its SQLite storage and is the single authority: every move is a `POST /api/match/:code/move`, the DO runs `applyMove()`, persists, and returns the new state. No client-side writes, no optimistic-lock dance — the DO serializes turns by construction.
- Join flow: `POST /api/match/:code/join` claims a player slot and returns a secret `playerToken`; the client stores it in localStorage keyed by match code. All subsequent moves require it. A full match state sent to a client is **redacted** — the opponent's secret token never leaves the DO, and (nothing else is secret in this game; the chain is public).
- Updates: client polls `GET /api/match/:code?since=<version>` every 8s while waiting, only when the tab is visible (Page Visibility API). The DO tracks a version counter so unchanged polls are cheap 304-style responses. WebSockets via the DO are a v2 nicety, not v1.
- Challenge resolution: the client sends a bare `challenge`; the **Worker/DO** is the referee — it calls dictionaryapi.dev (server-side fetch avoids CORS and keeps one canonical verdict), embedded list first, API second, then applies the instant STANDS/REJECTED outcome via `applyMove`. If the API errors, the DO returns an error and the challenger retries (see §Challenge) — no state changes.
- Rejoining: `/m/CODE` deep link + stored token resumes directly, mid-challenge included.
- Match cleanup: DO sets a 60-day alarm on last activity, then deletes itself. (Storage is tiny; this is hygiene, not cost.)
- Push-adjacent nudge (v2, optional): "your turn" via Web Push. Not in v1.

## States

```
(create) → P1_TURN ⇄ P2_TURN → LAST_CALL → CHAIN_COMPLETE
                → GAME_OVER (lives exhausted)
```

`LAST_CALL` belongs to whoever didn't play the final word (`lastCallActorOf`);
accept completes the chain, a REJECTED challenge rewinds it below the limit and
play re-enters the turn loop.

A challenge resolves inside a single turn — no `CHALLENGE_PENDING` phase (removed
2026-07 with the fold/stand step). A fresh match starts in the opener's turn with
the second seat empty and the transient flag `awaitingOpponent: true` on the
state. The opener plays their opening word and shares the invite _before_ anyone
joins; `joinMatch()` just fills the seat and clears the flag, leaving the phase as
the opener left it — so the friend steps straight into their own turn to answer.
(There is no separate LOBBY phase; the old "join before anyone can move" deadlock
is gone.)
`applyMove(state, actor, move) -> newState | error`. Moves: `play(word)`,
`pass()`, `challenge(wordIsReal)` — the referee's verdict is injected by the
caller (DO / solo controller), keeping the engine pure — and `accept()`, legal
only during `LAST_CALL` (the handshake needs no referee).

## Screens (mobile-first, 375px)

1. **Home** — Duel a friend (create) / Play a local llama / Join with a code / Resume match (if one is live).
2. **Open + invite** — creating drops the opener straight onto the board in their own turn; they play an opening word, then an invite sheet (native share + copy-link + raw code) hands the match to a friend. A friend who taps the invite link lands on an **invite screen** ("{name} invited you…", the opening word, and Get started / How to play / Try the tutorial — the tutorial returns them to the invite). There is no waiting lobby.
3. **Match** — the staircase ledger with the camera rail (see §The ledger camera) over a custom key deck (see §Inline play & the deck — this supersedes the earlier input-bar spec). Challenge is initiated by tapping the opponent's newest word (⚖ tag + confirm sheet). Player HUD cards (color, points, life pips) pinned top; the active player's card wears its own color as the chiclet lip (soft pulse while the bot thinks) — there is no turn pill.
4. **Challenge verdict** — full-screen dramatic beat: the **STANDS** / **REJECTED** stamp on the word, the ruling, and who lost a life. It fires instantly on the challenger's tap — no defender prompt, no waiting.
5. **Last call** — the chain just filled; the non-finisher's deck is replaced by the last-call bar ("Shake on it" / tap the word to challenge), the finisher waits ("Your last word is on the table."). See §Match end and mockups/last-call.html.
6. **Chain complete / Game over** — points count-up animation, full chain replay, Rematch button (rematch swaps who opens).

## Visual direction (FINAL — see mockups/threes-v2-rail.html for the reference)

- Threes-inspired: warm cream board, candy "chiclet" tiles with a hard bottom lip (solid color, `box-shadow: 0 4px 0 <lip>`), border-radius ~7px, no blur shadows on tiles, rounded chunky type (Baloo 2 or similar) for words and UI.
- Palette: board #F6F3EE, board-low #EAE6DE, text #3E4854 / #55606E, muted #A8AEB8.
    - Player 1 (always "you" on your own device) INDIGO: fill #8B90F4, lip #6A6FDC, ink white. Tint: fill #DCDEFB, lip #BFC2F3, ink #565CC4.
    - Player 2 CORAL: fill #F98B57, lip #DE6A2E, ink white. Tint: fill #FDE2D3, lip #F5C4A6, ink #D0682A.
    - (Re-colored 2026-07 from the original sky-blue/pink at Matt's call — indigo/coral is also the colorblind-safer pairing.)
- **The tint-joint rule (signature):** every word renders in its owner's color. Letters that are shared with an adjacent word render in the pale tint of their own word's color — the giving word's tail tints, and the gripping word's head tints. Both sides of every joint fade. Consequence to preserve: full-saturation tiles are the _unspent_ letters, so the board visibly "drains" as the chain gets used up.
- **Logo (FINAL, 2026-07): "the stair"** — SPELL over LLAMA as real chain tiles, LLAMA's head LL gripping SPELL's tail LL, tint-joints applied (see mockups/logo-mocks.html, direction A). Used on the home screen and as the app icon. No other logo surfaces in v1.
- Lives are colored pips in the player's color (grayed when lost). Points totals in each player's HUD card. Turn pill takes the active player's color.
- Motion: new word slides in along the rail and lands with a small settle; challenge verdicts stamp REAL/FAKE. Respect `prefers-reduced-motion`.

## The ledger camera (FINAL)

- The chain is a pure staircase on a virtual canvas: each word's row is offset so its head letters sit under the tail letters it grips. No wrapping, no cropping. Word length cap: 12 letters (enforced by rules), so any single row fits the viewport.
- **Camera on a rail:** the user scrolls vertically (native scroll element for momentum); scroll position maps to distance along the polyline of actual row anchor positions, and the canvas transform follows — the view glides diagonally along the chain's true path, never drifting. A faint dotted thread renders the rail behind the tiles.
- Default camera position: pinned to the newest word + required tail + input. When scrolled away, show a "▼ Back to latest" pill; new-move arrival while scrolled shows a toast, doesn't yank the camera.
- History rows are tappable for a detail card (owner, points, challenge outcome ⚖). Margin annotations keep the receipts.
- **Scroll-back = free explore (revised 2026-07, v2)**: a small scroll up releases the camera from the rail — free native two-axis panning over the true staircase canvas, dotted thread and all. "▼ Back to latest" snaps back onto the rail at the newest word. The rail-locked glide is only for the pinned live view; history is explored freely on the diagonal itself.
- `prefers-reduced-motion` / accessibility fallback: a plain left-aligned vertical list, one word per row, tint-joints intact (they carry the overlap info without the staircase).

## Inline play & the deck (FINAL — see mockups/keyboard-deck.html)

Supersedes the input-bar + system-keyboard spec (2026-07, Matt's call).

- **The deck**: a custom in-app keyboard in board style — 26 chiclet letter keys + backspace, nothing else. Never the system keyboard (it eats ~300px, jumps the viewport, and autocorrects bluffs to death). Keys 44px tall; backspace's only neighbor is M.
- **Inline play**: no input line. Your letters land directly on the next stair of the chain, exactly where the word will live. The head letters render pre-tinted as the grip; the gripped word's tail tints live as you type.
- **The grip fan (empty state)**: before the first letter, the 2/3/4-letter grips render as dashed ghost rows, each aligned under the letters it grips, with payout metas (· 4g+ / · 9g+ / · 16g+) — the fan is both the prompt and the scoring lesson. Tap a seed or just type; typed letters snap to the deepest matching grip. Deeper grips than the fan shows are legal — just type them.
- **The parked camera**: on the first letter, the view slides so the gripped letters pin to the left edge (x=14); the previous word's spent letters bleed off-screen. Your row head sits at the edge with the full width ahead — a 12-letter word fits with room for the caret. Backspacing to empty un-parks. "◀ N words back" chip is the escape to the full chain. Under prefers-reduced-motion the park is a cut, not a glide.
- **Safe submit**: Play rides the gripped word's row at the right edge, bottom-aligned with its tiles, quoting the take ("Play it! +9g") — a full deck-row of air from backspace. It disables under 3 letters. Dead keys are inert: a letter that can't start any grip never lands, so the fan is the ONLY hint system — no prompt text anywhere. Pass sits bottom-left in the deck (opposite corner from delete) and keeps the two-step confirm: "Pass and lose a life?" → confirm/cancel.
- **The stakeout (multiplayer, opponent's turn)**: the deck retires — the chain gets the full height, and one quiet line sits where the deck was ("Dana's move — we'll be here." + the polling promise). When your turn arrives, their word lands on the rail, the card lips swap, and the deck slides up from the bottom edge: the arrival is the turn signal. Solo keeps the dimmed deck — bot waits are seconds, and the board shouldn't flap. Under prefers-reduced-motion the deck appears without the slide.
- **HUD never compresses** — parking + the short deck leave ample room; while typing, only the camera moves. Challenge (⚖ on the word) is available only before the first letter of a draft.

## Tagline & how-to (FINAL, 2026-07)

- Home tagline: **"It's your word against theirs."** Share/store description leads with the same line. "Bluffing is legal; getting caught is not" lives inside the how-to page.
- **How to play**: one scrollable page behind a small home-screen link — four beats (chain words / grab more, score more / nobody checks your spelling / winning), every diagram in real tiles, ends "That's it. Go make up a word." (See mockups/tagline-howto.html; the playable-onboarding concept there shipped 2026-07-13 as the tutorial, below.)

## Lloyd's tutorial (FINAL, 2026-07-13 — see mockups/tutorial-flow.html)

A scripted first match vs **Lloyd, "the Tutorial Llama"** that teaches by playing: a real 10-word match (`chainLimit` on MatchState) on the real match screen, Lloyd's early moves scripted, the player set up to win. Fifteen beats: welcome → the table-setting (two tap-through Lloyd cards over the empty board: trading words that overlap / the two ways to win; his PLANT lands the instant they're tapped away — no thinking pause on the opening) → the opener (Lloyd claims PLANT: first word can be anything, every word after has to connect) → the grip (fan + bubble) → guided first word (ghost-finish tile + glowing key, suggestion ANTIC — the only two tutorial-only affordances, used once) → points by contrast (Lloyd's deliberately lazy 2-grip) → unguided rep → the smell test (Lloyd plays a fake, OTTERLY on the happy path) → the ruling (shipped confirm sheet + Lloyd's whisper) → REJECTED (shipped stamp; Lloyd's fake is struck instantly and he loses a life — the player is then on move) → rulings-cut-both-ways → the bluff invitation (Lloyd never challenges it) → handover (coach chrome retires; last 4 words vs the real easy bot) → the win (shipped game-over panel + Lloyd's sendoff + **"Duel a friend" as the coral primary** — the bridge to the invite flow).

- Coach chrome: on-board bubbles with Lloyd's LL-tile avatar; two eyebrows — LLOYD (lies in character) vs THE LESSON (the trustworthy instruction). Gated beats advance on a tap anywhere; guidance fades deliberately (ghost word → fan only → nothing).
- Entry: a Home card ("New here? Try the tutorial!") until first completion (localStorage `wordchain.tutorial.v1`), then a quiet "Tutorial" link; the how-to page cross-links it. Exit is the shipped ← Home; not resumable (it's two minutes).
- Script robustness: player words can leave tails no list word grips — every scripted slot falls back to a generated fake (grip + llama-flavored ending) rather than pass, and the player's challenge is ruled against the embedded list (deterministic and offline), so Lloyd's planted fake is always REJECTED.
- Code: `src/solo/tutorial.ts` (pure script + copy, unit-tested), `src/solo/useTutorial.ts` (beat machine), `src/screens/TutorialWelcome.tsx` + `TutorialMatch.tsx`. Shipped components gained tutorial-only optional props: composer `hintTail`, deck `glowKey`, sheet `whisper`, game-over `sendoff`/`onDuel`.

## Copy voice

Playful and plain, matching the candy visuals. "The chain ends in 6 words." "Dana is thinking…" Errors are friendly and specific: "Your word needs to start with RD or ARD." Never scold; the tone is two friends at a table.

## Open decisions (ask the user if it matters, otherwise take the default)

- Chain length 20 → default yes; make it a match setting later.
- Profanity filter on played words → default off (private matches between friends).
- Spectator link → out of scope v1.
