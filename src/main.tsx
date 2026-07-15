import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { consumeSeatLink } from './multi/storage'
import './index.css'

registerSW({ immediate: true })
// Before anything reads localStorage: a seat link restores match tokens
// carried through an iOS delete-and-re-add (see storage.ts).
consumeSeatLink()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
