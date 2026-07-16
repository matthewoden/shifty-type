// Word Chain rules engine. Pure functions only — no dictionary, no network,
// no randomness. Runs identically in the browser and the Durable Object.

import {
    CHAIN_LIMIT,
    MAX_WORD_LENGTH,
    MIN_OVERLAP,
    MIN_WORD_LENGTH,
    STARTING_LIVES,
    type MatchPhase,
    type MatchState,
    type Move,
    type PlayerId,
} from "./types";

export type MoveResult =
    | { ok: true; state: MatchState }
    | { ok: false; error: string };

const WORD_RE = new RegExp(`^[a-z]{${MIN_WORD_LENGTH},${MAX_WORD_LENGTH}}$`);

export function opponentOf(id: PlayerId): PlayerId {
    return id === "p1" ? "p2" : "p1";
}

function turnPhaseOf(id: PlayerId): MatchPhase {
    return id === "p1" ? "P1_TURN" : "P2_TURN";
}

/** Who answers last call: whoever didn't play the final word. Only
 *  meaningful while phase is LAST_CALL (the chain is at its limit). */
export function lastCallActorOf(state: MatchState): PlayerId {
    return opponentOf(state.chain[state.chain.length - 1].owner);
}

/** Points earned by a word: (overlap * overlap) + 1 per non-overlapped letter. */
export function pointsFor(overlap: number, wordLength: number): number {
    return overlap * overlap + Math.max(0, wordLength - overlap);
}

/**
 * Longest k where the last k letters of prev equal the first k letters of
 * next. k ranges from MIN_OVERLAP up to the full previous word — but the
 * full word only counts when next is strictly longer (prev must be a
 * proper prefix: ultra → ultramarine). Returns 0 when no valid overlap.
 */
export function overlapOf(prev: string, next: string): number {
    const max = Math.min(prev.length, next.length);
    for (let k = max; k >= MIN_OVERLAP; k--) {
        if (k === prev.length && next.length <= prev.length) continue;
        if (prev.slice(-k) === next.slice(0, k)) return k;
    }
    return 0;
}

/** All suffixes of prev a next word may start with, shortest first. */
export function validSuffixes(prev: string): string[] {
    const out: string[] = [];
    for (let k = MIN_OVERLAP; k <= prev.length; k++) out.push(prev.slice(-k));
    return out;
}

/**
 * The grip a partially-typed word is reaching for: the deepest k whose
 * suffix is consistent with what's typed so far (the whole suffix once
 * typed is long enough, a prefix of it while still short). 0 = no valid
 * grip. Display-only — submission is judged by overlapOf.
 */
export function provisionalGrip(prev: string, typed: string): number {
    if (!typed) return 0;
    for (let k = prev.length; k >= MIN_OVERLAP; k--) {
        const suffix = prev.slice(-k);
        const consistent =
            typed.length >= k
                ? typed.startsWith(suffix)
                : suffix.startsWith(typed);
        if (consistent) return k;
    }
    return 0;
}

/** The shallow grips shown as ghost seeds, with their base payouts. */
export function gripOptions(
    prev: string,
    max = 3,
): Array<{ letters: string; overlap: number; points: number }> {
    const out: Array<{ letters: string; overlap: number; points: number }> = [];
    for (let k = MIN_OVERLAP; k <= prev.length && out.length < max; k++) {
        out.push({ letters: prev.slice(-k), overlap: k, points: k * k });
    }
    return out;
}

/** Per-key deck guidance while composing a reply. */
export interface KeyHints {
    /** Letters that may legally be pressed next, as one lowercase string. */
    valid: string;
    /** The single letter, if exactly one is legal (the forced next press). */
    forced: string | null;
}

/**
 * Which letters the deck should light for the next keypress, given the chain
 * tip and what's typed so far. Returns null when there is no restriction — the
 * opener (no previous word), or once the grip is locked and any letter keeps a
 * legal word going — so the deck shows a plain, fully-live keyboard. Mirrors
 * the dead-key rule in useComposer: a letter is valid iff it keeps the
 * provisional grip at or above MIN_OVERLAP.
 */
export function nextKeyHints(
    prev: string | null,
    typed: string,
): KeyHints | null {
    if (!prev) return null;
    let valid = "";
    for (let c = 97; c <= 122; c++) {
        const letter = String.fromCharCode(c);
        if (provisionalGrip(prev, typed + letter) >= MIN_OVERLAP)
            valid += letter;
    }
    // All 26 legal → grip is locked, the rest of the word is free-form.
    if (valid.length === 26) return null;
    return { valid, forced: valid.length === 1 ? valid : null };
}

export function createMatch(
    p1Name: string,
    p2Name: string | null = null,
    opener: PlayerId = "p1",
    chainLimit?: number,
): MatchState {
    return {
        // The opener plays and shares the invite before anyone joins, so a fresh
        // match starts in the opener's turn with the second seat empty.
        phase: turnPhaseOf(opener),
        players: {
            p1: { id: "p1", name: p1Name, points: 0, lives: STARTING_LIVES },
            p2: {
                id: "p2",
                name: p2Name ?? "",
                points: 0,
                lives: STARTING_LIVES,
            },
        },
        chain: [],
        usedWords: [],
        winner: null,
        version: 0,
        ...(chainLimit !== undefined ? { chainLimit } : {}),
        ...(p2Name === null ? { awaitingOpponent: true } : {}),
    };
}

/** The chain length that closes this match. */
export function chainLimitOf(state: MatchState): number {
    return state.chainLimit ?? CHAIN_LIMIT;
}

/**
 * The friend takes the empty seat. The phase is left as the opener already
 * set it — if they've opened, the joiner steps straight into their own turn;
 * if not, it's still the opener's move. Only the waiting flag clears.
 */
export function joinMatch(state: MatchState, p2Name: string): MatchState {
    const next = structuredClone(state);
    next.players.p2.name = p2Name;
    delete next.awaitingOpponent;
    next.version++;
    return next;
}

/**
 * Winner when the chain completes: highest points, ties broken by remaining
 * lives, then by longest single word on the chain. Null on a full tie.
 */
export function decideChainWinner(state: MatchState): PlayerId | null {
    const { p1, p2 } = state.players;
    if (p1.points !== p2.points) return p1.points > p2.points ? "p1" : "p2";
    if (p1.lives !== p2.lives) return p1.lives > p2.lives ? "p1" : "p2";
    const longest = (id: PlayerId) =>
        Math.max(
            0,
            ...state.chain
                .filter((l) => l.owner === id)
                .map((l) => l.word.length),
        );
    const l1 = longest("p1");
    const l2 = longest("p2");
    if (l1 !== l2) return l1 > l2 ? "p1" : "p2";
    return null;
}

/**
 * The single door into match state. Validates the actor and the move
 * against the current phase and returns a NEW state (the input is never
 * mutated) or a player-facing error message.
 */
export function applyMove(
    state: MatchState,
    actor: PlayerId,
    move: Move,
): MoveResult {
    if (state.phase === "CHAIN_COMPLETE" || state.phase === "GAME_OVER")
        return err("This match is over.");

    if (state.phase === "LAST_CALL") {
        if (actor !== lastCallActorOf(state)) return err("Not your turn yet.");
        if (move.type === "accept") return accept(state);
        if (move.type === "challenge")
            return challenge(state, actor, move.wordIsReal);
        return err("The chain is full — shake on the last word, or challenge it.");
    }

    // P1_TURN or P2_TURN
    const active: PlayerId = state.phase === "P1_TURN" ? "p1" : "p2";
    if (actor !== active) return err("Not your turn yet.");
    if (move.type === "accept")
        return err("Nothing to shake on yet — the chain isn't full.");
    if (move.type === "play") return play(state, actor, move.word);
    if (move.type === "pass") return pass(state, actor);
    return challenge(state, actor, move.wordIsReal);
}

function err(error: string): MoveResult {
    return { ok: false, error };
}

function play(state: MatchState, actor: PlayerId, rawWord: string): MoveResult {
    const word = rawWord.trim().toLowerCase();
    if (!WORD_RE.test(word))
        return err(
            `Words are ${MIN_WORD_LENGTH}–${MAX_WORD_LENGTH} letters, a–z only.`,
        );
    if (state.usedWords.includes(word))
        return err(`${word.toUpperCase()} has already been played this match.`);

    const prev = state.chain[state.chain.length - 1];
    let overlap = 0;
    if (prev) {
        overlap = overlapOf(prev.word, word);
        if (overlap === 0) {
            const s2 = prev.word.slice(-2).toUpperCase();
            const s3 = prev.word.slice(-3).toUpperCase();
            return err(`Your word needs to start with ${s2} or ${s3}.`);
        }
    }

    const next = structuredClone(state);
    const points = prev ? pointsFor(overlap, word.length) : 0;
    next.chain.push({ word, owner: actor, overlap, points });
    next.usedWords.push(word);
    next.players[actor].points += points;
    next.version++;
    if (next.chain.length >= chainLimitOf(next)) {
        // The chain is full, but the match isn't over: the other player gets
        // last call — shake on the final word, or challenge it.
        next.phase = "LAST_CALL";
    } else {
        next.phase = turnPhaseOf(opponentOf(actor));
    }
    return { ok: true, state: next };
}

/** Shake on the final word: the chain stands as played, the match completes. */
function accept(state: MatchState): MoveResult {
    const next = structuredClone(state);
    next.version++;
    next.phase = "CHAIN_COMPLETE";
    next.winner = decideChainWinner(next);
    return { ok: true, state: next };
}

function pass(state: MatchState, actor: PlayerId): MoveResult {
    const next = structuredClone(state);
    next.players[actor].lives--;
    next.version++;
    if (next.players[actor].lives <= 0) {
        next.phase = "GAME_OVER";
        next.winner = opponentOf(actor);
    } else {
        // Opponent continues from the same word; no points moves.
        next.phase = turnPhaseOf(opponentOf(actor));
    }
    return { ok: true, state: next };
}

/**
 * A challenge resolves immediately against the referee's verdict — no pending
 * phase, no defender fold/stand. Real → STANDS: the word is marked survived and
 * the challenger loses a life. Fake → REJECTED: the word is removed, its owner
 * loses a life, the chain rewinds. Either way the challenger is on move next
 * (they play on from the survived word, or from the rewound tail) — except when
 * a last-call challenge STANDS: the chain is full and verified, so the match
 * completes on the spot.
 */
function challenge(
    state: MatchState,
    actor: PlayerId,
    wordIsReal: boolean,
): MoveResult {
    const target = state.chain[state.chain.length - 1];
    if (!target) return err("Nothing to challenge yet.");
    if (target.owner === actor)
        return err("You can't challenge your own word.");
    if (target.challengeSurvived)
        return err(
            `${target.word.toUpperCase()} already survived a challenge.`,
        );

    const defender = opponentOf(actor);
    const next = structuredClone(state);
    next.version++;
    if (wordIsReal) {
        next.chain[next.chain.length - 1].challengeSurvived = true;
        next.players[actor].lives--;
        if (next.players[actor].lives <= 0) {
            next.phase = "GAME_OVER";
            next.winner = defender;
        } else if (next.chain.length >= chainLimitOf(next)) {
            // Last call: the final word stands, so the chain is complete.
            next.phase = "CHAIN_COMPLETE";
            next.winner = decideChainWinner(next);
        } else {
            // Challenger still has to make a move, now from the verified word.
            next.phase = turnPhaseOf(actor);
        }
    } else {
        rewindChain(next);
        next.players[defender].lives--;
        if (next.players[defender].lives <= 0) {
            next.phase = "GAME_OVER";
            next.winner = actor;
        } else {
            // Challenger plays from the previous word.
            next.phase = turnPhaseOf(actor);
        }
    }
    return { ok: true, state: next };
}

/** Remove the accused word and refund the points it earned. */
function rewindChain(state: MatchState): void {
    const removed = state.chain.pop();
    if (removed) state.players[removed.owner].points -= removed.points;
    // The word stays in usedWords: busted fakes can't be replayed.
}
