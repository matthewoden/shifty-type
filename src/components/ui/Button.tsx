// The pressable vocabulary. Every ordinary button in the app is one of three
// shapes — a block CTA (rounded-2xl, colored lip), a pill (rounded-full), or
// a quiet text button — so heights, lips, and disabled states can't drift
// apart between screens. One-off controls (deck keys, swipe-delete, the gear,
// the bell pill's denied state) stay bespoke where they live.
//
// className is for layout only (margins, width, flex-1, animation classes) —
// never for overriding a color or size baked in here; there's no class
// merging, so a conflicting utility wins by stylesheet order, not intent.

import type { ButtonHTMLAttributes } from 'react'

type Variant = 'cta' | 'pill' | 'text'
type Accent = 'p1' | 'p2' | 'ink' | 'white' | 'dim'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<
  Variant,
  { base: string; size: Record<Size, string>; accent: Record<Accent, string> }
> = {
  // Block CTAs: full-width in a stack, colored lip, dip on press.
  cta: {
    base: 'rounded-2xl font-extrabold active:translate-y-0.5 disabled:opacity-50 disabled:active:translate-y-0 flex items-center justify-center gap-2',
    size: { sm: 'h-12', md: 'h-13', lg: 'h-14 text-lg' },
    accent: {
      p1: 'bg-p1 text-white shadow-[0_4px_0_var(--color-p1-lip)]',
      p2: 'bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)]',
      ink: 'bg-ink-strong text-white shadow-[0_4px_0_#262E38]',
      white: 'bg-white text-ink shadow-[0_3px_0_#E2DDD3]',
      dim: 'bg-white text-dim shadow-[0_3px_0_#E2DDD3]',
    },
  },
  // Pills: inline actions that read as one object — icon + label.
  pill: {
    base: 'rounded-full font-extrabold active:translate-y-0.5 disabled:opacity-50 disabled:active:translate-y-0 inline-flex items-center justify-center gap-2',
    size: { sm: 'h-10 px-4 text-ui', md: 'h-11 px-4 text-ui', lg: 'h-12 px-6 text-[14px]' },
    accent: {
      p1: 'bg-p1 text-white shadow-[0_3px_0_var(--color-p1-lip)]',
      p2: 'bg-p2 text-white shadow-[0_4px_0_var(--color-p2-lip)]',
      ink: 'bg-ink-strong text-white shadow-[0_2px_0_#262E38]',
      white: 'bg-white text-ink shadow-[0_3px_0_#E2DDD3]',
      dim: 'bg-white text-dim shadow-[0_3px_0_#E2DDD3]',
    },
  },
  // Text buttons: back/close/cancel. No lip, no dip; full tap-target height.
  text: {
    base: 'rounded-xl font-extrabold disabled:opacity-50',
    size: { sm: 'h-11 px-3 text-ui', md: 'h-11 px-4', lg: 'h-11 px-4 text-lg' },
    accent: {
      dim: 'text-dim',
      p1: 'text-p1-lip',
      p2: 'text-p2-lip',
      ink: 'text-ink-strong',
      white: 'text-white',
    },
  },
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: Variant
  /** Defaults to 'dim' for text buttons, 'p1' otherwise. */
  accent?: Accent
  size?: Size
}

export function Button({
  variant,
  accent,
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const v = VARIANTS[variant]
  const a = accent ?? (variant === 'text' ? 'dim' : 'p1')
  const classes = `${v.base} ${v.size[size]} ${v.accent[a]}${className ? ` ${className}` : ''}`
  return <button type={type} className={classes} {...rest} />
}
