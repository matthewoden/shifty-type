import { useState } from 'react'
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

export default function App() {
  const initial = initialScreen()
  const [screen, setScreen] = useState<Screen>(initial)
  // Bumped on every entry into a match so the match screen remounts fresh.
  const [matchKey, setMatchKey] = useState(0)
  // The invite an unseated friend arrived on: How-to and the tutorial return
  // here instead of Home, so tapping either never loses the game they're
  // being invited into.
  const [pendingInvite, setPendingInvite] = useState<string | null>(
    initial.name === 'invite' ? initial.code : null,
  )

  const goHome = () => {
    setPendingInvite(null)
    window.history.pushState(null, '', '/')
    setScreen({ name: 'home' })
  }
  const goLobby = () => {
    setPendingInvite(null)
    window.history.pushState(null, '', '/')
    setScreen({ name: 'lobby' })
  }
  const enterSolo = (save: SoloSave, from?: 'lobby') => {
    setMatchKey((k) => k + 1)
    setScreen({ name: 'solo', save, from })
  }
  const enterDuel = (code: string, from?: 'lobby') => {
    setPendingInvite(null)
    window.history.pushState(null, '', `/m/${code}`)
    setMatchKey((k) => k + 1)
    setScreen({ name: 'duel', code, from })
  }
  const showInvite = (code: string) => {
    setPendingInvite(code)
    window.history.pushState(null, '', `/m/${code}`)
    setScreen({ name: 'invite', code })
  }
  // Back out of How-to / the tutorial: to the pending invite if there is one,
  // otherwise Home.
  const backFromDetour = () =>
    pendingInvite ? showInvite(pendingInvite) : goHome()

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
          key={matchKey}
          save={screen.save}
          onExit={screen.from === 'lobby' ? goLobby : goHome}
          backLabel={screen.from === 'lobby' ? 'Games' : 'Home'}
        />
      )
    case 'howto':
      return (
        <HowTo
          onBack={backFromDetour}
          onPlayLlama={() => enterSolo(newSoloSave('easy'))}
          onTutorial={() => setScreen({ name: 'tutorial-welcome' })}
        />
      )
    case 'tutorial-welcome':
      return (
        <TutorialWelcome
          onPlay={() => {
            setMatchKey((k) => k + 1)
            setScreen({ name: 'tutorial' })
          }}
          onRules={() => setScreen({ name: 'howto' })}
          onBack={backFromDetour}
        />
      )
    case 'tutorial':
      return (
        <TutorialMatch
          key={matchKey}
          onExit={backFromDetour}
          onDuel={() => setScreen({ name: 'duel-create' })}
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
          onNewDuel={() => setScreen({ name: 'duel-create' })}
        />
      )
    case 'settings':
      return <Settings onBack={goHome} />
    case 'duel-create':
      return <DuelCreate onEnterMatch={enterDuel} onBack={goHome} />
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
            setScreen({ name: 'howto' })
          }}
          onTutorial={() => {
            setPendingInvite(inviteCode)
            setScreen({ name: 'tutorial-welcome' })
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
              setScreen({ name: 'howto' })
            }}
            onTutorial={() => {
              setPendingInvite(inviteCode)
              setScreen({ name: 'tutorial-welcome' })
            }}
            onBack={goHome}
          />
        )
      }
      return (
        <MultiMatch
          key={matchKey}
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
          onHowTo={() => setScreen({ name: 'howto' })}
          onSolo={() => setScreen({ name: 'solo-setup' })}
          onDuel={() => setScreen({ name: 'duel-create' })}
          onJoinCode={() => setScreen({ name: 'join-code' })}
          onTutorial={() => setScreen({ name: 'tutorial-welcome' })}
          onOpenGames={() => setScreen({ name: 'lobby' })}
          onSettings={() => setScreen({ name: 'settings' })}
          onResumeDuel={enterDuel}
        />
      )
  }
}
