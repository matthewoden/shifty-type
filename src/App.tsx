import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Difficulty } from './game'
import { api } from './lib/api'
import { getSavedName, loadMatchAuth, saveMatchAuth } from './multi/storage'
import { DuelCreate } from './screens/DuelCreate'
import { JoinByCode } from './screens/JoinByCode'
import { InviteLanding } from './screens/InviteLanding'
import { Home } from './screens/Home'
import { HowTo } from './screens/HowTo'
import { Lobby } from './screens/Lobby'
import { MultiMatch } from './screens/MultiMatch'
import { Settings } from './screens/Settings'
import { SoloMatch } from './screens/SoloMatch'
import { SoloSetup } from './screens/SoloSetup'
import { TutorialMatch } from './screens/TutorialMatch'
import { TutorialWelcome } from './screens/TutorialWelcome'
import { newSoloSave, type SoloSave } from './solo/useSoloMatch'

type Screen =
  | { name: 'home' }
  | { name: 'lobby' }
  | { name: 'solo-setup' }
  | { name: 'solo'; save: SoloSave; from?: 'lobby' }
  | { name: 'duel-create' }
  | { name: 'duel-draft' }
  | { name: 'join-code' }
  | { name: 'invite'; code: string }
  | { name: 'howto' }
  | { name: 'duel'; code: string; from?: 'lobby' }
  | { name: 'tutorial-welcome' }
  | { name: 'tutorial' }
  | { name: 'settings' }

/** Deep link: /m/CODE resumes with a stored token or lands on the invite. */
function initialScreen(): Screen {
  const dm = window.location.pathname.match(/^\/m\/([A-Za-z0-9]{4})$/)
  if (dm) {
    const code = dm[1].toUpperCase()
    return loadMatchAuth(code) ? { name: 'duel', code } : { name: 'invite', code }
  }
  return { name: 'home' }
}

/** How a navigation moves: 'push' slides the new screen in from the right,
 *  'pop' slides the old one back out (every Back is a pop). Lobby rows are
 *  plain pushes too — a container-transform expand was tried twice (clip
 *  grow, then a floating row-card that filled and crossfaded) and read as a
 *  white flash at phone width, so it was retired. */
type NavKind = 'push' | 'pop'

/** Every navigation gets a fresh key, so the incoming screen always mounts
 *  clean — this is also what remounts a match screen on re-entry. */
interface Entry {
  screen: Screen
  key: number
}

interface Transition {
  prev: Entry
  kind: NavKind
}

/** The animations whose end means the layer swap is done — child animations
 *  bubble their own ends up, so the name filter keeps them from cutting the
 *  transition short. */
const DRIVERS = ['nav-slide-in', 'nav-slide-out']

export default function App() {
  const [current, setCurrent] = useState<Entry>(() => ({ screen: initialScreen(), key: 0 }))
  const [trans, setTrans] = useState<Transition | null>(null)
  // The invite an unseated friend arrived on: How-to and the tutorial return
  // here instead of Home, so tapping either never loses the game they're
  // being invited into.
  const [pendingInvite, setPendingInvite] = useState<string | null>(() => {
    const s = initialScreen()
    return s.name === 'invite' ? s.code : null
  })
  const stageRef = useRef<HTMLDivElement>(null)
  const prevLayerRef = useRef<HTMLDivElement>(null)
  const scrollAtNav = useRef(0)

  const navigate = (screen: Screen, kind: NavKind = 'push') => {
    scrollAtNav.current = window.scrollY
    setTrans({ prev: current, kind })
    setCurrent({ screen, key: current.key + 1 })
    window.scrollTo(0, 0)
  }

  // The outgoing screen keeps the view it had — including how far the page
  // was scrolled — when it swaps from document flow into its clipped layer.
  useLayoutEffect(() => {
    if (trans && prevLayerRef.current) prevLayerRef.current.scrollTop = scrollAtNav.current
  }, [trans])

  // Belt over the animationend braces: never strand two layers on screen.
  useEffect(() => {
    if (!trans) return
    const t = window.setTimeout(() => setTrans(null), 700)
    return () => clearTimeout(t)
  }, [trans])

  const endTransition = (e: React.AnimationEvent) => {
    if (e.target === e.currentTarget && DRIVERS.includes(e.animationName)) setTrans(null)
  }

  const goHome = () => {
    setPendingInvite(null)
    window.history.pushState(null, '', '/')
    navigate({ name: 'home' }, 'pop')
  }
  const goLobby = () => {
    setPendingInvite(null)
    window.history.pushState(null, '', '/')
    navigate({ name: 'lobby' }, 'pop')
  }
  const enterSolo = (save: SoloSave, from?: 'lobby') => {
    navigate({ name: 'solo', save, from })
  }
  const enterDuel = (code: string, from?: 'lobby') => {
    setPendingInvite(null)
    window.history.pushState(null, '', `/m/${code}`)
    navigate({ name: 'duel', code, from })
  }
  // "Challenge a friend": straight to a local draft board — no match exists
  // until the opening word is played. First-timers detour through the name
  // gate. Nothing is created (or left behind) by merely looking.
  const startDuel = () => {
    navigate(getSavedName() ? { name: 'duel-draft' } : { name: 'duel-create' })
  }
  // The opening word landed and the match now exists: adopt its address
  // without remounting — same key, so the board never flickers mid-play.
  const draftCreated = (code: string) => {
    window.history.pushState(null, '', `/m/${code}`)
    setCurrent((c) => ({ screen: { name: 'duel', code }, key: c.key }))
  }
  const showInvite = (code: string, kind: NavKind = 'push') => {
    setPendingInvite(code)
    window.history.pushState(null, '', `/m/${code}`)
    navigate({ name: 'invite', code }, kind)
  }
  // Back out of How-to / the tutorial: to the pending invite if there is one,
  // otherwise Home. The label always names where it actually leads.
  const backFromDetour = () =>
    pendingInvite ? showInvite(pendingInvite, 'pop') : goHome()
  const detourBackLabel = pendingInvite ? 'Invite' : 'Home'

  // The tutorial ending, for a player who arrived from an invite: drop them
  // straight into that match. A returning device (name saved) joins and enters
  // directly; a first-timer routes to the invite landing to pick a name (one
  // tap from the board). A failed join (seat taken) also falls back there.
  const resumeInvite = (code: string) => {
    const name = getSavedName()
    if (!name) return showInvite(code)
    void api.join(code, name).then((r) => {
      if (r.ok) {
        saveMatchAuth(code, { token: r.token, you: 'p2' })
        enterDuel(code)
      } else {
        showInvite(code)
      }
    })
  }

  const renderScreen = (screen: Screen) => {
    switch (screen.name) {
      case 'solo-setup':
        return (
          <SoloSetup
            onStart={(difficulty: Difficulty) => enterSolo(newSoloSave(difficulty))}
            onBack={goHome}
          />
        )
      case 'solo':
        return (
          <SoloMatch
            save={screen.save}
            onExit={screen.from === 'lobby' ? goLobby : goHome}
            backLabel={screen.from === 'lobby' ? 'Games' : 'Home'}
          />
        )
      case 'howto':
        return (
          <HowTo
            onBack={backFromDetour}
            backLabel={detourBackLabel}
            onPlayLlama={() => enterSolo(newSoloSave('easy'))}
            onTutorial={() => navigate({ name: 'tutorial-welcome' })}
          />
        )
      case 'tutorial-welcome':
        return (
          <TutorialWelcome
            onPlay={() => navigate({ name: 'tutorial' })}
            onRules={() => navigate({ name: 'howto' })}
            onBack={backFromDetour}
            backLabel={detourBackLabel}
          />
        )
      case 'tutorial':
        return (
          <TutorialMatch
            onExit={backFromDetour}
            backLabel={detourBackLabel}
            onDuel={startDuel}
            onRematchLloyd={() => enterSolo(newSoloSave('easy', 'p2'))}
            resumeInvite={pendingInvite}
            onResumeInvite={resumeInvite}
          />
        )
      case 'lobby':
        return (
          <Lobby
            onBack={goHome}
            onOpenMatch={(code) => enterDuel(code, 'lobby')}
            onResumeSolo={(save) => enterSolo(save, 'lobby')}
            onNewDuel={startDuel}
          />
        )
      case 'settings':
        return <Settings onBack={goHome} />
      case 'duel-create':
        return <DuelCreate onStart={() => navigate({ name: 'duel-draft' })} onBack={goHome} />
      case 'duel-draft':
        return (
          <MultiMatch
            code={null}
            token={null}
            draftName={getSavedName() || 'Anonymous'}
            onCreated={draftCreated}
            onExit={goHome}
          />
        )
      case 'join-code':
        return <JoinByCode onEnterMatch={enterDuel} onBack={goHome} />
      case 'invite': {
        const inviteCode = screen.code
        return (
          <InviteLanding
            code={inviteCode}
            onEnterMatch={enterDuel}
            onHowTo={() => {
              setPendingInvite(inviteCode)
              navigate({ name: 'howto' })
            }}
            onTutorial={() => {
              setPendingInvite(inviteCode)
              navigate({ name: 'tutorial-welcome' })
            }}
            onBack={goHome}
          />
        )
      }
      case 'duel': {
        const auth = loadMatchAuth(screen.code)
        if (!auth) {
          const inviteCode = screen.code
          return (
            <InviteLanding
              code={inviteCode}
              onEnterMatch={enterDuel}
              onHowTo={() => {
                setPendingInvite(inviteCode)
                navigate({ name: 'howto' })
              }}
              onTutorial={() => {
                setPendingInvite(inviteCode)
                navigate({ name: 'tutorial-welcome' })
              }}
              onBack={goHome}
            />
          )
        }
        return (
          <MultiMatch
            code={screen.code}
            token={auth.token}
            onExit={screen.from === 'lobby' ? goLobby : goHome}
            backLabel={screen.from === 'lobby' ? 'Games' : 'Home'}
          />
        )
      }
      default:
        return (
          <Home
            onHowTo={() => navigate({ name: 'howto' })}
            onSolo={() => navigate({ name: 'solo-setup' })}
            onDuel={startDuel}
            onJoinCode={() => navigate({ name: 'join-code' })}
            onTutorial={() => navigate({ name: 'tutorial-welcome' })}
            onOpenGames={() => navigate({ name: 'lobby' })}
            onSettings={() => navigate({ name: 'settings' })}
            onResumeDuel={enterDuel}
          />
        )
    }
  }

  // Idle: the screen renders in normal document flow (page scroll and all).
  // During a transition the stage pins to the viewport and both screens ride
  // absolutely-positioned layers; the outgoing layer keeps its key, so the
  // screen the player is leaving never remounts mid-slide.
  const currentClass = !trans
    ? undefined
    : trans.kind === 'push'
      ? 'nav-layer nav-slide-in'
      : 'nav-layer nav-unpark'
  const prevClass =
    trans?.kind === 'push'
      ? 'nav-layer nav-park pointer-events-none'
      : 'nav-layer nav-slide-out pointer-events-none'

  return (
    <div ref={stageRef} className={trans ? 'nav-stage' : undefined}>
      {trans && (
        <div
          key={trans.prev.key}
          ref={prevLayerRef}
          className={prevClass}
          onAnimationEnd={trans.kind === 'pop' ? endTransition : undefined}
          aria-hidden
        >
          {renderScreen(trans.prev.screen)}
        </div>
      )}
      <div
        key={current.key}
        className={currentClass}
        onAnimationEnd={trans?.kind === 'push' ? endTransition : undefined}
      >
        {renderScreen(current.screen)}
      </div>
    </div>
  )
}
