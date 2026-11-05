import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startDiagnostics } from './lib/diag'
import { startWebApp } from './lib/pwa'
import { getSettings, subscribeSettings } from './lib/settings'
import { startSync } from './lib/sync'
import { keepScreenAwake } from './lib/wakeLock'
import './styles/app.css'

startDiagnostics(() => getSettings().shareDiagnostics)
subscribeSettings(keepScreenAwake(() => getSettings().keepAwake))
if (!('desktop' in window)) startWebApp()
startSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
