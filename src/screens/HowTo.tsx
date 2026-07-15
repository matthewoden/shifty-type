import { tileClass } from '../components/tiles'
import { FlagIcon } from '../components/icons'

const GHOST =
  'w-[23px] h-8 shrink-0 rounded-[7px] border-2 border-dashed border-[#C9CFD8] text-dim flex items-center justify-center font-extrabold text-lg uppercase select-none'

function Tiles({ word, side, headTint = 0, tailTint = 0 }: { word: string; side: 'you' | 'them'; headTint?: number; tailTint?: number }) {
  return (
    <span className="flex gap-[3px]">
      {word.split('').map((ch, j) => (
        <span key={j} className={tileClass(side, j < headTint || j >= word.length - tailTint)}>
          {ch}
        </span>
      ))}
    </span>
  )
}

function Ghosts({ letters, take }: { letters: string; take: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex gap-[3px]">
        {letters.split('').map((ch, j) => (
          <span key={j} className={GHOST}>
            {ch}
          </span>
        ))}
      </span>
      <span className="text-[10px] font-extrabold text-dim">· {take}</span>
    </div>
  )
}

function Rule() {
  return <hr className="border-0 border-t-[3px] border-dotted border-[#E4DFD5] my-6" />
}

export function HowTo({
  onBack,
  onPlayLlama,
  onTutorial,
}: {
  onBack: () => void
  onPlayLlama: () => void
  onTutorial: () => void
}) {
  return (
    <div className="min-h-dvh bg-board">
      <div className="max-w-md mx-auto px-6 py-8">
        <button onClick={onBack} className="h-11 -ml-2 px-2 font-extrabold text-[13px] text-dim">
          ← Back
        </button>
        <div className="text-center mt-2">
          <h1 className="text-2xl font-extrabold text-ink-strong">How to play</h1>
          <p className="text-dim font-semibold text-sm mt-1">Four rules, one minute.</p>
          <button onClick={onTutorial} className="h-11 px-3 font-extrabold text-[13px] text-p1-lip">
            Or learn by playing — try the tutorial ›
          </button>
        </div>
        <Rule />

        <h2 className="font-extrabold text-lg text-ink-strong mb-1.5">1 · Chain words</h2>
        <p className="font-semibold text-[13.5px] text-ink leading-relaxed">
          Your word must start with the <b>last letters</b> of theirs — at least two.
        </p>
        <div className="my-3.5 flex flex-col gap-1.5">
          <Tiles word="shifty" side="you" tailTint={2} />
          <div style={{ marginLeft: 104 }}>
            <Tiles word="type" side="them" headTint={2} />
          </div>
        </div>
        <p className="font-semibold text-xs text-dim">
          Pale tiles are letters that got used up by the join.
        </p>
        <Rule />

        <h2 className="font-extrabold text-lg text-ink-strong mb-1.5">2 · Grab more, score more</h2>
        <p className="font-semibold text-[13.5px] text-ink leading-relaxed">
          Points = <b>overlap × overlap</b>, plus a bonus for long words. The starters show your
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

        <h2 className="font-extrabold text-lg text-ink-strong mb-1.5">3 · Lives &amp; winning</h2>
        <p className="font-semibold text-[13.5px] text-ink leading-relaxed">
          You have <b>3 lives</b>{' '}
          <span className="inline-flex gap-1 mx-0.5 align-baseline">
            <span className="w-2.5 h-2.5 rounded-full bg-p1 shadow-[0_2px_0_var(--color-p1-lip)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-p1 shadow-[0_2px_0_var(--color-p1-lip)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-p1 shadow-[0_2px_0_var(--color-p1-lip)]" />
          </span>
          . Run your friend out of theirs and you win on the spot — otherwise, most points when the
          chain hits <b>20 words</b>.
        </p>
        <p className="font-semibold text-[13.5px] text-ink leading-relaxed mt-2">
          Lives go when you get stuck and pass — or in a challenge. Which brings us to the fun
          part.
        </p>
        <Rule />

        <h2 className="font-extrabold text-lg text-ink-strong mb-1.5">
          4 · If it sounds real, play it
        </h2>
        <p className="font-semibold text-[13.5px] text-ink leading-relaxed">
          Your word doesn't have to be real — it just has to <i>sound</i> real. Nothing gets
          checked when you play it.
        </p>
        <p className="font-semibold text-[13.5px] text-ink leading-relaxed mt-2">
          But your friend can tap your word and challenge it{' '}
          <FlagIcon className="inline w-4 h-4 align-[-2px] text-p2-lip" /> — then you <b>fold</b> (take it
          back, lose a life) or <b>stand</b> (there's an official ruling, and whoever's wrong takes
          the hit).
        </p>
        <p className="font-extrabold text-[13px] text-ink-strong mt-3">
          Bluffing is legal; getting caught is not.
        </p>
        <Rule />

        <p className="text-center font-extrabold text-ink-strong">
          That's it. Go make up a word.
        </p>
        <div className="flex flex-col gap-3 mt-6 pb-8 max-w-xs mx-auto">
          <button
            onClick={onPlayLlama}
            className="h-13 rounded-2xl font-extrabold bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)] active:translate-y-0.5"
          >
            Try it against a llama
          </button>
          <button onClick={onBack} className="h-11 rounded-xl font-extrabold text-dim">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
