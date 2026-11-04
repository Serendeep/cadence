import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startWebApp } from './lib/pwa'
import './styles/app.css'

if (!('desktop' in window)) startWebApp()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
