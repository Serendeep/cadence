import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startDiagnostics } from './lib/diag'
import { startWebApp } from './lib/pwa'
import { getSettings } from './lib/settings'
import './styles/app.css'

startDiagnostics(() => getSettings().diagnostics)
if (!('desktop' in window)) startWebApp()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
