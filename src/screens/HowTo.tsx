import { tileClass } from "../components/tiles";
import { FlagIcon } from "../components/icons";
import { TileLockup } from "../components/TileLockup";
import { Button } from "../components/ui/Button";

const GHOST =
    "w-[23px] h-8 shrink-0 rounded-[7px] border-2 border-dashed border-[#C9CFD8] text-dim flex items-center justify-center font-extrabold text-lg uppercase select-none";

function Tiles({
    word,
    side,
    headTint = 0,
    tailTint = 0,
}: {
    word: string;
    side: "you" | "them";
    headTint?: number;
    tailTint?: number;
}) {
    return (
        <span className="flex gap-[3px]">
            {word.split("").map((ch, j) => (
                <span
                    key={j}
                    className={tileClass(
                        side,
                        j < headTint || j >= word.length - tailTint,
                    )}
                >
                    {ch}
                </span>
            ))}
        </span>
    );
}

function Ghosts({ letters, take }: { letters: string; take: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="flex gap-[3px]">
                {letters.split("").map((ch, j) => (
                    <span key={j} className={GHOST}>
                        {ch}
                    </span>
                ))}
            </span>
            <span className="text-note font-extrabold text-dim">· {take}</span>
        </div>
    );
}

function Rule() {
    return (
        <hr className="border-0 border-t-[3px] border-dotted border-[#E4DFD5] my-6" />
    );
}

export function HowTo({
    onBack,
    backLabel = "Home",
    onPlayLlama,
    onTutorial,
}: {
    onBack: () => void;
    /** Where back leads — "Home", or "Invite" when the reader detoured here
     *  from an invite landing (backFromDetour returns them to it). */
    backLabel?: string;
    onPlayLlama: () => void;
    onTutorial: () => void;
}) {
    return (
        <div className="min-h-dvh bg-board">
            {/* Same slim top bar as Settings and the match screens — the back
          button rides at the same height everywhere. */}
            <div className="flex items-center px-3.5 pt-2 pb-2.5">
                <Button variant="text" size="sm" onClick={onBack}>
                    ← {backLabel}
                </Button>
            </div>
            <div className="max-w-md mx-auto px-6 pb-8">
                {/* The header plays the game's own move (FAST → START, grip
                    ST) on the quick clock; the rules fade up while the tiles
                    still land. */}
                <div className="text-center flex flex-col items-center">
                    <h1 className="sr-only">How to play</h1>
                    <TileLockup
                        top="fast"
                        bottom="start"
                        pace="quick"
                        kicker="Quick rules for a"
                        label="Fast start"
                    />
                    <div className="setup-fade">
                        <p className="text-dim font-semibold text-small mt-3">
                            Four rules, one minute.
                        </p>
                        <Button
                            variant="text"
                            size="sm"
                            accent="p1"
                            onClick={onTutorial}
                        >
                            Or learn by playing — try the tutorial ›
                        </Button>
                    </div>
                </div>
                <div className="setup-fade">
                    <Rule />

                    <h2 className="font-extrabold text-lg text-ink-strong mb-1.5">
                        1 · Chain words
                    </h2>
                    <p className="font-semibold text-body text-ink leading-relaxed">
                        Your word must start with the <b>last letters</b> of theirs
                        — at least two — and add at least <b>two new letters</b> of
                        its own.
                    </p>
                    <div className="my-3.5 flex flex-col gap-1.5">
                        <Tiles word="shifty" side="you" tailTint={2} />
                        <div style={{ marginLeft: 104 }}>
                            <Tiles word="type" side="them" headTint={2} />
                        </div>
                    </div>
                    <p className="font-semibold text-caption text-dim">
                        Pale tiles are letters that got used up by the overlap.
                    </p>
                    <Rule />

                    <h2 className="font-extrabold text-lg text-ink-strong mb-1.5">
                        2 · Grab more, score more
                    </h2>
                    <p className="font-semibold text-body text-ink leading-relaxed">
                        Points = <b>overlap × overlap</b>, plus one point for every
                        letter you add after the overlap. The starters show your
                        options:
                    </p>
                    <div className="my-3.5 flex flex-col gap-1.5">
                        <div style={{ marginLeft: 52 }}>
                            <Ghosts letters="rd" take="4+" />
                        </div>
                        <div style={{ marginLeft: 26 }}>
                            <Ghosts letters="ard" take="9+" />
                        </div>
                        <Ghosts letters="ward" take="16+" />
                    </div>
                    <Rule />

                    <h2 className="font-extrabold text-lg text-ink-strong mb-1.5">
                        3 · Lives &amp; winning
                    </h2>
                    <p className="font-semibold text-body text-ink leading-relaxed">
                        You have <b>3 lives</b>{" "}
                        <span className="inline-flex gap-1 mx-0.5 align-baseline">
                            <span className="w-2.5 h-[calc(var(--spacing)*2.2)] rounded-full bg-p1 shadow-[0_2px_0_var(--color-p1-lip)]" />
                            <span className="w-2.5 h-[calc(var(--spacing)*2.2)] rounded-full bg-p1 shadow-[0_2px_0_var(--color-p1-lip)]" />
                            <span className="w-2.5 h-[calc(var(--spacing)*2.2)] rounded-full bg-p1 shadow-[0_2px_0_var(--color-p1-lip)]" />
                        </span>
                        . Run your friend out of theirs and you win on the spot —
                        otherwise, most points when the chain hits <b>20 words</b>.
                    </p>
                    <p className="font-semibold text-body text-ink leading-relaxed mt-2">
                        Lives go when you get stuck and pass — or in a challenge.
                        And if you <i>both</i> pass on the same word, the chain
                        snaps: those words are settled, and whoever's up starts a
                        fresh chain with any word. Which brings us to the fun part.
                    </p>
                    <Rule />

                    <h2 className="font-extrabold text-lg text-ink-strong mb-1.5">
                        4 · If it sounds real, play it
                    </h2>
                    <p className="font-semibold text-body text-ink leading-relaxed">
                        Your word doesn't have to be real — it just has to{" "}
                        <i>sound</i> real. Nothing gets checked when you play it.
                    </p>
                    <p className="font-semibold text-body text-ink leading-relaxed mt-2">
                        But your friend can tap your word and challenge it{" "}
                        <FlagIcon className="inline w-4 h-4 align-[-2px] text-p2-lip" />
                        : If your word <b>stands</b>, the challenge costs your
                        friend a life. If it's <b>rejected</b>, the word is struck
                        and the lost life is yours.
                    </p>
                    <p className="font-extrabold text-body text-ink-strong mt-3">
                        Bluffing is legal; getting caught is not.
                    </p>
                    <Rule />

                    <p className="text-center font-extrabold text-ink-strong">
                        That's it. Now you're ready to play.
                    </p>
                    <div className="flex flex-col gap-3 mt-6 pb-8 max-w-xs mx-auto">
                        <Button variant="cta" accent="p1" onClick={onPlayLlama}>
                            Try it against a llama
                        </Button>
                        <Button variant="text" onClick={onBack}>
                            Got it
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
