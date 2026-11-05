import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startDiagnostics } from './lib/diag'
import { startWebApp } from './lib/pwa'
import { getSettings, subscribeSettings } from './lib/settings'
import { repairSmartCubeSplits } from './lib/repairSplits'
import { startSync } from './lib/sync'
import { keepScreenAwake } from './lib/wakeLock'
import './styles/app.css'

startDiagnostics(() => getSettings().shareDiagnostics)
subscribeSettings(keepScreenAwake(() => getSettings().keepAwake))
if (!('desktop' in window)) startWebApp()
startSync()
repairSmartCubeSplits().catch((e: unknown) => console.warn('Could not recalculate smart cube phases', e))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
