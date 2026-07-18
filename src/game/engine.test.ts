import { describe, it, expect } from "vitest";
import {
    applyMove,
    createMatch,
    decideChainWinner,
    pointsFor,
    joinMatch,
    gripOptions,
    gripTargetOf,
    isChainBroken,
    nextKeyHints,
    overlapOf,
    provisionalGrip,
    validSuffixes,
    type MoveResult,
} from "./engine";
import {
    CHAIN_LIMIT,
    type MatchState,
    type Move,
    type PlayerId,
} from "./types";

const play = (word: string): Move => ({ type: "play", word });
const pass: Move = { type: "pass" };
// The referee's verdict is injected: true → STANDS, false → REJECTED.
const challenge = (wordIsReal: boolean): Move => ({
    type: "challenge",
    wordIsReal,
});

/** Apply a scripted move list, throwing on any rejection. */
function run(state: MatchState, steps: Array<[PlayerId, Move]>): MatchState {
    for (const [actor, move] of steps) {
        const r = applyMove(state, actor, move);
        if (!r.ok) throw new Error(`${actor} ${move.type}: ${r.error}`);
        state = r.state;
    }
    return state;
}

function expectError(r: MoveResult, message: string) {
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(message);
}

const fresh = () => createMatch("You", "Dana");

describe("overlapOf", () => {
    it("finds the longest suffix-prefix overlap", () => {
        expect(overlapOf("vault", "ultra")).toBe(3);
        expect(overlapOf("ultra", "radish")).toBe(2);
        expect(overlapOf("onward", "zebra")).toBe(0);
    });

    it("requires at least two new letters past the grip", () => {
        expect(overlapOf("ram", "rams")).toBe(0); // adding an S is not a play
        expect(overlapOf("ram", "ramps")).toBe(3);
        expect(overlapOf("planet", "net")).toBe(0); // no new letters at all
        expect(overlapOf("planet", "nets")).toBe(0); // still just one
        expect(overlapOf("planet", "netting")).toBe(3);
    });

    it("allows the full previous word as a grip when outgrown by two", () => {
        expect(overlapOf("ultra", "ultramarine")).toBe(5);
        expect(overlapOf("ultra", "ultras")).toBe(0); // one letter past — too snug
        expect(overlapOf("ultra", "ultra")).toBe(0); // same word
    });

    it("falls back to a shallower grip when the deepest is too snug", () => {
        // NANA can't extend (only one new letter), but NA can.
        expect(overlapOf("banana", "nanas")).toBe(2);
    });

    it("never returns an overlap below 2", () => {
        expect(overlapOf("cat", "tap")).toBe(0);
    });
});

describe("pointsFor", () => {
    it("is overlap squared plus length - overlap", () => {
        expect(pointsFor(2, 4)).toBe(6);
        expect(pointsFor(3, 6)).toBe(12);
        expect(pointsFor(4, 7)).toBe(19);
        expect(pointsFor(5, 11)).toBe(31); // ultramarine
    });
});

describe("validSuffixes", () => {
    it("lists suffixes shortest first, up to the whole word", () => {
        expect(validSuffixes("onward")).toEqual([
            "rd",
            "ard",
            "ward",
            "nward",
            "onward",
        ]);
    });
});

describe("match setup", () => {
    it("opens in the opener's turn while awaiting a friend, and lets the opener play", () => {
        const state = createMatch("You");
        expect(state.phase).toBe("P1_TURN");
        expect(state.awaitingOpponent).toBe(true);
        // The opener can open a word before anyone joins; the waiting seat can't move.
        expectError(
            applyMove(state, "p2", play("vault")),
            "Not your turn yet.",
        );
        const opened = applyMove(state, "p1", play("vault"));
        expect(opened.ok).toBe(true);
        if (opened.ok) expect(opened.state.phase).toBe("P2_TURN");
    });

    it("joinMatch fills the seat and clears the waiting flag", () => {
        // Opener has already played, so the joiner steps into their own turn.
        const opened = run(createMatch("You"), [["p1", play("vault")]]);
        const state = joinMatch(opened, "Dana");
        expect(state.phase).toBe("P2_TURN");
        expect(state.awaitingOpponent).toBeUndefined();
        expect(state.players.p2.name).toBe("Dana");
    });

    it("starts immediately with both names (solo mode)", () => {
        expect(fresh().phase).toBe("P1_TURN");
    });
});

describe("playing a word", () => {
    it("accepts any well-formed opener with no points", () => {
        const state = run(fresh(), [["p1", play("vault")]]);
        expect(state.chain).toEqual([
            { word: "vault", owner: "p1", overlap: 0, points: 0 },
        ]);
        expect(state.players.p1.points).toBe(0);
        expect(state.phase).toBe("P2_TURN");
    });

    it("scores overlap² + length bonus and alternates turns", () => {
        const state = run(fresh(), [
            ["p1", play("vault")],
            ["p2", play("ultra")], // overlap ult → 11
            ["p1", play("radish")], // overlap ra → 8
        ]);
        expect(state.players.p2.points).toBe(11);
        expect(state.players.p1.points).toBe(8);
        expect(state.phase).toBe("P2_TURN");
        expect(state.version).toBe(3);
    });

    it("handles ultra → ultramarine: overlap 5, points: 31", () => {
        const state = run(fresh(), [
            ["p1", play("vault")],
            ["p2", play("ultra")],
            ["p1", play("ultramarine")],
        ]);
        const link = state.chain[2];
        expect(link.overlap).toBe(5);
        expect(link.points).toBe(31);
        expect(state.players.p1.points).toBe(31);
    });

    it("normalizes case and whitespace", () => {
        const state = run(fresh(), [["p1", play("  VAULT ")]]);
        expect(state.chain[0].word).toBe("vault");
    });

    it("rejects malformed words", () => {
        const msg = "Words are 3–40 letters, a–z only.";
        expectError(applyMove(fresh(), "p1", play("ab")), msg);
        expectError(applyMove(fresh(), "p1", play("a".repeat(41))), msg);
        expectError(applyMove(fresh(), "p1", play("don't")), msg);
        expectError(applyMove(fresh(), "p1", play("abc1")), msg);
    });

    it("accepts the 28-letter showpiece", () => {
        const state = run(fresh(), [
            ["p1", play("elephant")],
            ["p2", play("antidisestablishmentarianism")],
        ]);
        // overlap ANT (3²) + one per non-overlapped letter (28 − 3)
        expect(state.chain[1].points).toBe(34);
    });

    it("rejects repeats, case-insensitively", () => {
        const state = run(fresh(), [
            ["p1", play("vault")],
            ["p2", play("ultra")],
        ]);
        expectError(
            applyMove(state, "p1", play("Ultra")),
            "ULTRA has already been played this match.",
        );
    });

    it("rejects words with no valid overlap, naming the required suffixes", () => {
        const state = run(fresh(), [
            ["p1", play("vault")],
            ["p2", play("ultra")],
            ["p1", play("ultramarine")],
            ["p2", play("neon")],
            ["p1", play("onward")],
        ]);
        expectError(
            applyMove(state, "p2", play("zebra")),
            "Your word needs to start with RD or ARD.",
        );
    });

    it("rejects a word that grips but adds fewer than two new letters", () => {
        const state = run(fresh(), [["p1", play("vault")]]);
        expectError(
            applyMove(state, "p2", play("ultr")),
            "Too snug — your word needs two letters of its own after the overlap.",
        );
    });

    it("accepts a bluff — no dictionary check at play time", () => {
        const state = run(fresh(), [
            ["p1", play("vault")],
            ["p2", play("ltxq")], // pure nonsense, valid overlap "lt"
        ]);
        expect(state.chain[1].word).toBe("ltxq");
        expect(state.players.p2.points).toBe(6);
    });

    it("does not mutate the input state", () => {
        const before = fresh();
        const r = applyMove(before, "p1", play("vault"));
        expect(r.ok).toBe(true);
        expect(before.chain).toHaveLength(0);
        expect(before.version).toBe(0);
    });
});

describe("turn and actor guards", () => {
    it("rejects out-of-turn moves", () => {
        expectError(
            applyMove(fresh(), "p2", play("vault")),
            "Not your turn yet.",
        );
        expectError(applyMove(fresh(), "p2", pass), "Not your turn yet.");
    });
});

describe("passing", () => {
    it("costs a life, earns nothing, and hands over the same word", () => {
        const state = run(fresh(), [
            ["p1", play("vault")],
            ["p2", pass],
        ]);
        expect(state.players.p2.lives).toBe(2);
        expect(state.players.p2.points).toBe(0);
        expect(state.chain).toHaveLength(1);
        expect(state.phase).toBe("P1_TURN");
    });

    it("ends the game when the last life goes", () => {
        const state = run(fresh(), [
            ["p1", play("vault")],
            ["p2", pass],
            ["p1", pass],
            ["p2", pass],
            ["p1", pass],
            ["p2", pass], // p2's third pass
        ]);
        expect(state.phase).toBe("GAME_OVER");
        expect(state.winner).toBe("p1");
    });
});

describe("challenges", () => {
    const midMatch = () =>
        run(fresh(), [
            ["p1", play("vault")],
            ["p2", play("ultra")],
        ]);

    it("cannot target an empty chain", () => {
        expectError(
            applyMove(fresh(), "p1", challenge(false)),
            "Nothing to challenge yet.",
        );
    });

    it("cannot target your own word (e.g. after the opponent passes)", () => {
        const state = run(fresh(), [
            ["p1", play("vault")],
            ["p2", pass],
        ]);
        expectError(
            applyMove(state, "p1", challenge(false)),
            "You can't challenge your own word.",
        );
    });

    it("REJECTED (fake): word removed, points refunded, owner loses a life, challenger plays on", () => {
        const state = run(midMatch(), [["p1", challenge(false)]]);
        expect(state.chain.map((l) => l.word)).toEqual(["vault"]);
        expect(state.players.p2.points).toBe(0); // the 9g refunded
        expect(state.players.p2.lives).toBe(2);
        expect(state.phase).toBe("P1_TURN"); // the challenger plays from the previous word

        // …and must play from VAULT, not from the removed ULTRA
        expectError(
            applyMove(state, "p1", play("radish")),
            "Your word needs to start with LT or ULT.",
        );
        expect(applyMove(state, "p1", play("ultimatum")).ok).toBe(true);
    });

    it("a removed word can never be replayed", () => {
        const state = run(midMatch(), [["p1", challenge(false)]]);
        expectError(
            applyMove(state, "p1", play("ultra")),
            "ULTRA has already been played this match.",
        );
    });

    it("rejecting the opener leaves an empty chain and a fresh opening move", () => {
        const state = run(fresh(), [
            ["p1", play("xqzzle")],
            ["p2", challenge(false)],
        ]);
        expect(state.chain).toHaveLength(0);
        expect(state.phase).toBe("P2_TURN"); // the challenger (p2) opens next
        const next = applyMove(state, "p2", play("vault"));
        expect(next.ok).toBe(true);
        if (next.ok) expect(next.state.chain[0].points).toBe(0);
    });

    it("STANDS (real): challenger loses a life and plays on from the verified word", () => {
        const state = run(midMatch(), [["p1", challenge(true)]]);
        expect(state.players.p1.lives).toBe(2);
        expect(state.players.p2.lives).toBe(3);
        expect(state.players.p2.points).toBe(11); // keeps the points
        expect(state.chain[1].challengeSurvived).toBe(true);
        expect(state.phase).toBe("P1_TURN");
    });

    it("a survived word cannot be challenged again", () => {
        const state = run(midMatch(), [["p1", challenge(true)]]);
        expectError(
            applyMove(state, "p1", challenge(true)),
            "ULTRA already survived a challenge.",
        );
    });

    it("a failed challenge (STANDS) on the last life ends the game for the challenger", () => {
        const worn = run(midMatch(), [
            ["p1", pass],
            ["p2", play("radish")],
            ["p1", pass],
            ["p2", play("shovel")],
        ]);
        expect(worn.players.p1.lives).toBe(1);
        const state = run(worn, [["p1", challenge(true)]]);
        expect(state.phase).toBe("GAME_OVER");
        expect(state.winner).toBe("p2");
    });

    it("a busted bluff (REJECTED) on the last life ends the game for the word owner", () => {
        const worn = run(fresh(), [
            ["p1", play("vault")],
            ["p2", pass],
            ["p1", play("ultra")],
            ["p2", pass],
            ["p1", play("radish")],
            ["p2", play("shqux")], // bluff on the last life
        ]);
        expect(worn.players.p2.lives).toBe(1);
        const state = run(worn, [["p1", challenge(false)]]);
        expect(state.phase).toBe("GAME_OVER");
        expect(state.winner).toBe("p1");
    });
});

describe("the full chain: last call, then completion", () => {
    // aabb → bbcc → ccdd … each 4 letters, overlap 2, 4g apiece.
    const pair = (i: number) => String.fromCharCode(97 + i).repeat(2);
    const chainWords = Array.from(
        { length: CHAIN_LIMIT },
        (_, i) => pair(i) + pair(i + 1),
    );
    // p2 plays every even-numbered word, including the 20th — so p1 answers
    // last call.
    const full = () =>
        run(
            fresh(),
            chainWords.map((w, i): [PlayerId, Move] => [
                i % 2 === 0 ? "p1" : "p2",
                play(w),
            ]),
        );
    const accept: Move = { type: "accept" };

    it("the 20th word opens last call for the non-finisher — not the end", () => {
        const state = full();
        expect(state.phase).toBe("LAST_CALL");
        expect(state.winner).toBeNull();
        // Only the non-finisher may answer, and only with a shake or a flag.
        expectError(applyMove(state, "p2", accept), "Not your turn yet.");
        expectError(
            applyMove(state, "p1", play("ttzz")),
            "The chain is full — shake on the last word, or challenge it.",
        );
        expectError(
            applyMove(state, "p1", pass),
            "The chain is full — shake on the last word, or challenge it.",
        );
    });

    it("shaking on the final word completes the chain; highest points wins", () => {
        const state = run(full(), [["p1", accept]]);
        expect(state.phase).toBe("CHAIN_COMPLETE");
        // p1's opener earns just letter points, so p2 leads 60 to 54.
        expect(state.players.p1.points).toBe(54);
        expect(state.players.p2.points).toBe(60);
        expect(state.winner).toBe("p2");
        expectError(
            applyMove(state, "p1", play("anything")),
            "This match is over.",
        );
    });

    it("a last-call challenge that STANDS completes the chain, a life spent on the call", () => {
        const state = run(full(), [["p1", challenge(true)]]);
        expect(state.phase).toBe("CHAIN_COMPLETE");
        expect(state.chain[state.chain.length - 1].challengeSurvived).toBe(
            true,
        );
        expect(state.players.p1.lives).toBe(2);
        expect(state.winner).toBe("p2");
    });

    it("a bad last-call flag on the challenger's final life ends the game outright", () => {
        const worn = full();
        worn.players.p1.lives = 1;
        const state = run(worn, [["p1", challenge(true)]]);
        expect(state.phase).toBe("GAME_OVER");
        expect(state.winner).toBe("p2");
    });

    it("a REJECTED last-call challenge rewinds and play continues to a fresh last call", () => {
        let state = run(full(), [["p1", challenge(false)]]);
        // The fake 20th word is struck (points refunded), its owner pays a
        // life, and the challenger plays on from the rewound tail.
        expect(state.phase).toBe("P1_TURN");
        expect(state.chain.length).toBe(CHAIN_LIMIT - 1);
        expect(state.players.p2.lives).toBe(2);
        expect(state.players.p2.points).toBe(54);
        // The challenger lays a new 20th word — last call swings to p2.
        state = run(state, [["p1", play("ttzz")]]);
        expect(state.phase).toBe("LAST_CALL");
        state = run(state, [["p2", accept]]);
        expect(state.phase).toBe("CHAIN_COMPLETE");
    });

    it("there is nothing to shake on before the chain is full", () => {
        expectError(
            applyMove(fresh(), "p1", accept),
            "Nothing to shake on yet — the chain isn't full.",
        );
    });

    it("breaks points ties by lives, then longest word, then null", () => {
        const base = fresh();
        const withStats = (
            overrides: Partial<
                Record<PlayerId, { points?: number; lives?: number }>
            >,
            chain: Array<{ word: string; owner: PlayerId }> = [],
        ): MatchState => {
            const s = structuredClone(base);
            for (const id of ["p1", "p2"] as PlayerId[]) {
                s.players[id].points = overrides[id]?.points ?? 10;
                s.players[id].lives = overrides[id]?.lives ?? 2;
            }
            s.chain = chain.map((c) => ({ ...c, overlap: 2, points: 4 }));
            return s;
        };

        expect(
            decideChainWinner(
                withStats({ p1: { points: 12 }, p2: { points: 9 } }),
            ),
        ).toBe("p1");
        expect(
            decideChainWinner(
                withStats({ p1: { lives: 1 }, p2: { lives: 3 } }),
            ),
        ).toBe("p2");
        expect(
            decideChainWinner(
                withStats({}, [
                    { word: "longests", owner: "p1" },
                    { word: "short", owner: "p2" },
                ]),
            ),
        ).toBe("p1");
        expect(
            decideChainWinner(
                withStats({}, [
                    { word: "equal", owner: "p1" },
                    { word: "level", owner: "p2" },
                ]),
            ),
        ).toBeNull();
    });
});

describe("scripted match replay", () => {
    it("replays a full dramatic match from a move list", () => {
        const script: Array<[PlayerId, Move]> = [
            ["p1", play("vault")],
            ["p2", play("ultra")], // +9g
            ["p1", play("ultramarine")], // +30g
            ["p2", play("nectar")], // +4g
            ["p1", challenge(true)], // accuses NECTAR — real, STANDS: p1 loses a life, plays on
            ["p1", play("arrow")], // +4g, from the verified word
            ["p2", play("owly")], // +4g — a bluff
            ["p1", challenge(false)], // OWLY fake, REJECTED: p2 loses a life, owly removed, 4g refunded
            ["p1", pass], // p1 lives 1
            ["p2", pass], // p2 lives 1
            ["p1", pass], // p1 lives 0 — game over
        ];
        const state = run(fresh(), script);
        expect(state.phase).toBe("GAME_OVER");
        expect(state.winner).toBe("p2");
        expect(state.players.p1).toMatchObject({ points: 38, lives: 0 });
        expect(state.players.p2).toMatchObject({ points: 19, lives: 1 });
        expect(state.chain.map((l) => l.word)).toEqual([
            "vault",
            "ultra",
            "ultramarine",
            "nectar",
            "arrow",
        ]);
        expect(state.usedWords).toContain("owly");
        expect(state.version).toBe(11);
    });
});

describe("provisionalGrip (composer display)", () => {
    it("snaps a short prefix to the deepest matching grip", () => {
        expect(provisionalGrip("onward", "a")).toBe(3); // heading for ARD
        expect(provisionalGrip("onward", "w")).toBe(4); // heading for WARD
        expect(provisionalGrip("onward", "r")).toBe(2); // heading for RD
        expect(provisionalGrip("onward", "o")).toBe(6); // heading for the proper prefix
    });

    it("holds the grip once typing passes it", () => {
        expect(provisionalGrip("onward", "ard")).toBe(3);
        expect(provisionalGrip("onward", "ardent")).toBe(3);
        expect(provisionalGrip("onward", "rdxx")).toBe(2);
    });

    it("returns 0 for empty or impossible starts", () => {
        expect(provisionalGrip("onward", "")).toBe(0);
        expect(provisionalGrip("onward", "d")).toBe(0);
        expect(provisionalGrip("onward", "zebra")).toBe(0);
    });
});

describe("gripOptions (the fan)", () => {
    it("lists the shallowest grips with base payouts", () => {
        expect(gripOptions("onward")).toEqual([
            { letters: "rd", overlap: 2, points: 4 },
            { letters: "ard", overlap: 3, points: 9 },
            { letters: "ward", overlap: 4, points: 16 },
        ]);
    });

    it("caps at the word itself for short words", () => {
        expect(gripOptions("ram")).toEqual([
            { letters: "am", overlap: 2, points: 4 },
            { letters: "ram", overlap: 3, points: 9 },
        ]);
    });
});

describe("nextKeyHints (guided deck keys)", () => {
    it("has no restriction for the opener (no previous word)", () => {
        expect(nextKeyHints(null, "")).toBeNull();
    });

    it("flattens the whole deck at the word-length cap", () => {
        const capped = "x".repeat(40);
        // …whether mid-chain or on a free-form opener.
        expect(nextKeyHints("plant", capped)).toEqual({ valid: "", forced: null });
        expect(nextKeyHints(null, capped)).toEqual({ valid: "", forced: null });
    });

    it("lights the first letters of every valid suffix when nothing is typed", () => {
        // plant → suffixes nt, ant, lant, plant → first letters n, a, l, p
        const h = nextKeyHints("plant", "");
        expect(h).not.toBeNull();
        expect([...(h?.valid ?? "")].sort()).toEqual(["a", "l", "n", "p"]);
        expect(h?.forced).toBeNull();
    });

    it("narrows to a single forced letter mid-grip", () => {
        // otter, typed "te" → only "ter" is consistent, so r is forced
        const h = nextKeyHints("otter", "te");
        expect(h?.valid).toBe("r");
        expect(h?.forced).toBe("r");
    });

    it("offers the branch letters while several suffixes remain reachable", () => {
        // otter, typed "t" → "ter" (needs e) and "tter" (needs t) both live
        const h = nextKeyHints("otter", "t");
        expect([...(h?.valid ?? "")].sort()).toEqual(["e", "t"]);
        expect(h?.forced).toBeNull();
    });

    it("returns null once the grip is locked and the word is free-form", () => {
        // otter, typed "ter" → grip locked at 3, any next letter is legal
        expect(nextKeyHints("otter", "ter")).toBeNull();
    });
});

describe("the snap (both players pass on the same word)", () => {
    // vault on the table, then both players pass on it.
    const snapped = () =>
        run(fresh(), [
            ["p1", play("vault")],
            ["p2", pass],
            ["p1", pass],
        ]);

    it("snaps the chain on the second consecutive pass", () => {
        const s = snapped();
        expect(s.breaks).toEqual([1]);
        expect(s.phase).toBe("P2_TURN"); // whoever is on move opens fresh
        // Both passes still cost their life.
        expect(s.players.p1.lives).toBe(2);
        expect(s.players.p2.lives).toBe(2);
    });

    it("opens the board: any word, no overlap, no points — even one that grips", () => {
        const s = run(snapped(), [["p2", play("ultra")]]);
        const opener = s.chain[1];
        expect(opener).toMatchObject({ word: "ultra", overlap: 0, points: 0 });
        expect(s.players.p2.points).toBe(0);
        expect(s.breaks).toEqual([1]); // the break is history, not pending
        const next = run(s, [["p1", play("radish")]]);
        expect(next.chain[2].points).toBe(pointsFor(2, 6));
    });

    it("still refuses words already played this match", () => {
        expectError(
            applyMove(snapped(), "p2", play("vault")),
            "VAULT has already been played this match.",
        );
    });

    it("seals the words behind the break against challenges", () => {
        expectError(
            applyMove(snapped(), "p2", challenge(false)),
            "The chain snapped — those words are settled. Open a new one.",
        );
    });

    it("a played word between passes keeps the chain whole", () => {
        const s = run(fresh(), [
            ["p1", play("vault")],
            ["p2", pass],
            ["p1", play("ultra")],
            ["p2", pass],
        ]);
        expect(s.breaks).toBeUndefined();
        // …and only the NEXT consecutive pass snaps it.
        const s2 = run(s, [["p1", pass]]);
        expect(s2.breaks).toEqual([2]);
    });

    it("a challenge between passes resets the count", () => {
        // p2's fake is rejected, vault is the tip again (p1's own word);
        // p1 passes on it, and p2's failed challenge resets the streak.
        const roomy = fresh();
        roomy.players.p1.lives = 5;
        roomy.players.p2.lives = 5; // room for every life this script burns
        const s = run(roomy, [
            ["p1", play("vault")],
            ["p2", play("ltqxy")],
            ["p1", challenge(false)], // REJECTED — rewinds to vault, p1 on move
            ["p1", pass],
            ["p2", challenge(true)], // STANDS — p2 pays, and the streak resets
        ]);
        expect(s.passStreak).toBeUndefined();
        expect(s.breaks).toBeUndefined();
        const s2 = run(s, [
            ["p2", pass],
            ["p1", pass],
        ]);
        expect(s2.breaks).toEqual([1]);
    });

    it("an empty chain never snaps — the opener can already play anything", () => {
        const s = run(fresh(), [
            ["p1", pass],
            ["p2", pass],
        ]);
        expect(s.breaks).toBeUndefined();
        expect(isChainBroken(s)).toBe(false);
    });

    it("a rejected fresh opener re-opens the break", () => {
        const s = run(snapped(), [
            ["p2", play("zzqxy")],
            ["p1", challenge(false)], // the fresh opener was a fake
        ]);
        expect(s.chain).toHaveLength(1);
        expect(isChainBroken(s)).toBe(true); // breaks=[1] pends again
        const s2 = run(s, [["p1", play("grape")]]);
        expect(s2.chain[1]).toMatchObject({ overlap: 0, points: 0 });
    });

    it("a fresh opener can fill the chain and trigger last call", () => {
        const short = createMatch("You", "Dana", "p1", 2);
        const s = run(short, [
            ["p1", play("vault")],
            ["p2", pass],
            ["p1", pass],
            ["p2", play("grape")], // fresh opener is the final word
        ]);
        expect(s.phase).toBe("LAST_CALL");
    });

    it("the second pass can still end the game on lives", () => {
        const s = fresh();
        s.players.p1.lives = 1;
        const over = run(s, [
            ["p1", play("vault")],
            ["p2", pass],
            ["p1", pass],
        ]);
        expect(over.phase).toBe("GAME_OVER");
        expect(over.winner).toBe("p2");
    });

    it("gripTargetOf goes null while the snap pends, then follows the fresh chain", () => {
        const s = snapped();
        expect(gripTargetOf(s)?.word).toBeUndefined();
        expect(isChainBroken(s)).toBe(true);
        const s2 = run(s, [["p2", play("grape")]]);
        expect(gripTargetOf(s2)?.word).toBe("grape");
    });
});
