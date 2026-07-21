import {
    STARTING_LIVES,
    chainLimitOf,
    opponentOf,
    type MatchState,
    type PlayerId,
} from "../game";
import type { Side } from "./tiles";

function LifePips({ lives, side }: { lives: number; side: Side }) {
    const alive =
        side === "you"
            ? "bg-p1 shadow-[0_2px_0_var(--color-p1-lip)]"
            : "bg-p2 shadow-[0_2px_0_var(--color-p2-lip)]";
    return (
        <span className="inline-flex gap-1 mt-1">
            {Array.from({ length: STARTING_LIVES }, (_, i) => (
                <span
                    key={i}
                    className={`w-2.5 h-[calc(var(--spacing)*2.2)] rounded-full ${i < lives ? alive : "bg-board-lo shadow-[0_2px_0_#DDD8CE]"}`}
                />
            ))}
        </span>
    );
}

interface HudProps {
    state: MatchState;
    you: PlayerId;
    /** Whose move it is — their card wears its color as the lip. */
    active: PlayerId | null;
    /** Soft pulse on the active card (the bot is thinking). */
    pulse?: boolean;
}

function Card({
    state,
    id,
    side,
    active,
    pulse,
}: {
    state: MatchState;
    id: PlayerId;
    side: Side;
    active: boolean;
    pulse: boolean;
}) {
    const p = state.players[id];
    const lip = active
        ? side === "you"
            ? "shadow-[0_4px_0_var(--color-p1)]"
            : "shadow-[0_4px_0_var(--color-p2)]"
        : "shadow-[0_4px_0_#E2DDD3]";
    return (
        <div
            aria-label={`${p.name} — ${p.points} points, ${p.lives} lives${active ? ", to move" : ""}`}
            className={`flex-1 bg-white rounded-2xl px-3 py-2 ${side === "them" ? "text-right" : ""} ${lip} ${
                active && pulse ? "motion-safe:animate-pulse" : ""
            }`}
        >
            <div
                className={`font-extrabold text-[13px] ${side === "you" ? "text-p1-lip" : "text-p2-lip"}`}
            >
                {p.name.toUpperCase()}
            </div>
            <div className="font-extrabold text-2xl text-ink-strong">
                {p.points}
                <span className="text-[11px] text-dim"> pts</span>
            </div>
            <LifePips lives={p.lives} side={side} />
        </div>
    );
}

export function Hud({ state, you, active, pulse = false }: HudProps) {
    const opp = opponentOf(you);
    const wordsLeft = chainLimitOf(state) - state.chain.length;
    return (
        <div className="flex gap-2.5 px-3.5 pt-1 pb-2">
            <Card
                state={state}
                id={you}
                side="you"
                active={active === you}
                pulse={pulse}
            />
            <div className="self-center text-center text-[9px] font-extrabold tracking-widest text-dim uppercase leading-snug">
                {state.phase === "LAST_CALL" ? (
                    <>
                        LAST
                        <span className="block text-[15px] text-ink-strong tracking-widest leading-relaxed">
                            CALL
                        </span>
                    </>
                ) : (
                    <>
                        ENDS IN
                        <span className="block text-xl text-ink-strong tracking-normal">
                            {wordsLeft}
                        </span>
                        {wordsLeft === 1 ? "WORD" : "WORDS"}
                    </>
                )}
            </div>
            <Card
                state={state}
                id={opp}
                side="them"
                active={active === opp}
                pulse={pulse}
            />
        </div>
    );
}
