import { beginProfilePage } from './diagnostics/profileClock'
import { installTechnicalProfile, technicalCommit } from './diagnostics/technicalProfile'
import { Profiler, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import './styles/global.css'

beginProfilePage()
installTechnicalProfile()

const root = document.getElementById('root')

if (!root) {
  throw new Error('Milo could not find its application root.')
}

createRoot(root).render(
  <StrictMode>
    {import.meta.env.VITE_MILO_TECH_PROFILE === '1' ? (
      <Profiler id="app" onRender={technicalCommit}>
        <App />
      </Profiler>
    ) : (
      <App />
    )}
  </StrictMode>,
)
