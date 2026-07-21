// The settings view: one quiet place for the few things that aren't playing.
// Your name (saved instantly), the notifications master switch, and — off a
// phone that hasn't installed yet — the Add to Home Screen hand-off. Reached
// from the gear on Home. Kept deliberately small: no sound/theme/haptics to
// toggle, so this is a short hub, not a wall of switches.

import { useEffect, useState } from 'react'
import { getSavedName, saveName } from '../multi/storage'
import { useNudge } from '../multi/useNudge'
import {
  IosHowToSheet,
  SafariHandoffSheet,
} from '../components/InstallBadge'
import {
  isStandalone,
  promptInstall,
  useInstallKind,
} from '../components/useInstallPrompt'
import { CallBellIcon, DeviceMobileIcon } from '../components/icons'
import { Button } from '../components/ui/Button'

interface SettingsProps {
  onBack: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-label font-extrabold uppercase tracking-wider text-dim px-1 mb-1.5">
      {children}
    </p>
  )
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-[46px] h-7 rounded-full shrink-0 transition-colors disabled:opacity-50 ${
        on ? 'bg-p1 shadow-[inset_0_0_0_2px_var(--color-p1-lip)]' : 'bg-[#d7d2c8]'
      }`}
    >
      <span
        className={`absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-[0_2px_3px_rgba(0,0,0,0.25)] transition-all ${
          on ? 'left-[21px]' : 'left-[3px]'
        }`}
      />
    </button>
  )
}

export function Settings({ onBack }: SettingsProps) {
  const [name, setName] = useState(getSavedName())
  const [savedName, setSavedName] = useState(getSavedName())
  const [justSaved, setJustSaved] = useState(false)
  const dirty = name.trim() !== '' && name.trim() !== savedName

  useEffect(() => {
    if (!justSaved) return
    const t = setTimeout(() => setJustSaved(false), 2200)
    return () => clearTimeout(t)
  }, [justSaved])

  const save = () => {
    const n = name.trim()
    if (!n) return
    saveName(n)
    setSavedName(n)
    setName(n)
    setJustSaved(true)
  }

  const notify = useNudge()
  const nstat = notify.status
  const toggleNotify = () => {
    if (nstat === 'on') void notify.disable()
    else if (nstat === 'off') void notify.enable()
  }
  const notifyNote =
    nstat === 'unsupported'
      ? "On iPhone, add Shifty Type to your Home Screen first — then games can notify you."
      : nstat === 'denied'
        ? "Switched off for Shifty Type in your phone's settings. Turn notifications back on there."
        : nstat === 'on'
          ? 'On — every game notifies you when it’s your move.'
          : 'Get notified when a game needs you. The in-game button flips this same switch.'

  const kind = useInstallKind()
  const standalone = isStandalone()
  const [sheet, setSheet] = useState<null | 'ios' | 'handoff'>(null)
  const add = () => {
    if (kind === 'native') void promptInstall()
    else if (kind === 'ios') setSheet('ios')
    else if (kind === 'handoff') setSheet('handoff')
  }

  return (
    <div className="min-h-dvh bg-board flex flex-col">
      <div className="flex items-center px-3.5 pt-2 pb-2.5">
        <Button variant="text" size="sm" onClick={onBack}>
          ← Home
        </Button>
      </div>

      <div className="flex-1 w-full max-w-md mx-auto px-4 pb-10 flex flex-col gap-6">
        <h1 className="text-title font-extrabold text-ink-strong px-1">Settings</h1>

        {/* Name */}
        <section>
          <SectionLabel>Your name</SectionLabel>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setJustSaved(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && dirty && save()}
              maxLength={20}
              placeholder="Your name"
              className="flex-1 min-w-0 h-13 bg-white rounded-xl px-4 font-extrabold text-lg text-ink-strong shadow-[0_3px_0_#E2DDD3] outline-none focus:ring-2 focus:ring-p1 placeholder:text-dim placeholder:font-bold"
            />
            <button
              onClick={save}
              disabled={!dirty}
              className="px-5 rounded-xl font-extrabold text-status bg-p1 text-white shadow-[0_3px_0_var(--color-p1-lip)] active:translate-y-0.5 disabled:opacity-40 disabled:active:translate-y-0"
            >
              Save
            </button>
          </div>
          <p className={`text-caption font-semibold px-1 mt-2 ${justSaved ? 'text-p1-lip' : 'text-dim'}`}>
            {justSaved
              ? 'Saved ✓ — new games will use it.'
              : 'The name new games use. Games already going keep the name you joined with.'}
          </p>
        </section>

        {/* Notifications */}
        <section>
          <SectionLabel>Notifications</SectionLabel>
          <div className="bg-white rounded-2xl shadow-[0_3px_0_#E2DDD3] p-3.5 flex items-center gap-3">
            <span className="w-[38px] h-[38px] rounded-[11px] bg-board flex items-center justify-center shrink-0">
              <CallBellIcon className="w-5 h-5 text-p1-lip" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-status text-ink-strong leading-tight">
                Notify me for every game
              </p>
              <p className="text-caption font-semibold text-dim leading-snug mt-0.5">
                {nstat === 'unsupported' ? 'Needs the installed app' : 'A heads-up the moment it’s your move.'}
              </p>
            </div>
            {nstat !== 'unsupported' && (
              <Toggle
                on={nstat === 'on'}
                disabled={nstat === 'pending' || nstat === 'denied'}
                onChange={toggleNotify}
              />
            )}
          </div>
          <p className="text-caption font-semibold text-dim px-1 mt-2">{notifyNote}</p>
        </section>

        {/* Install */}
        {standalone ? (
          <section>
            <SectionLabel>App</SectionLabel>
            <div className="bg-white rounded-2xl shadow-[0_3px_0_#E2DDD3] p-3.5 flex items-center gap-3">
              <span className="w-[38px] h-[38px] rounded-[11px] bg-board flex items-center justify-center shrink-0">
                <DeviceMobileIcon className="w-5 h-5 text-p1-lip" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-status text-ink-strong leading-tight">
                  On your Home Screen
                </p>
                <p className="text-caption font-semibold text-dim leading-snug mt-0.5">
                  Installed — notifications and offline play are on.
                </p>
              </div>
              <span className="text-p1-lip font-extrabold text-lg">✓</span>
            </div>
          </section>
        ) : kind ? (
          <section>
            <SectionLabel>App</SectionLabel>
            <button
              onClick={add}
              className="w-full text-left bg-white rounded-2xl shadow-[0_3px_0_#E2DDD3] p-3.5 flex items-center gap-3 active:translate-y-0.5"
            >
              <span className="w-[38px] h-[38px] rounded-[11px] bg-board flex items-center justify-center shrink-0">
                <DeviceMobileIcon className="w-5 h-5 text-p1-lip" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-status text-ink-strong leading-tight">
                  Add to Home Screen
                </p>
                <p className="text-caption font-semibold text-dim leading-snug mt-0.5">
                  Play offline · get notified.
                </p>
              </div>
              <span className="text-dim font-extrabold text-lg">›</span>
            </button>
          </section>
        ) : null}

        <p className="text-caption font-semibold text-dim text-center mt-auto pt-4">Shifty Type</p>
      </div>

      {sheet === 'ios' && <IosHowToSheet onClose={() => setSheet(null)} />}
      {sheet === 'handoff' && <SafariHandoffSheet onClose={() => setSheet(null)} />}
    </div>
  )
}
