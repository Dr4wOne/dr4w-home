import { createRoot } from 'react-dom/client'
import './base.css'
import './app.css'
import { App, Gate, preloadDeviceView } from './App.tsx'
import { pickSource } from './source.ts'

const root = createRoot(document.getElementById('root') as HTMLElement)
const start = await pickSource()
root.render(
  start.mode === 'demo' || start.mode === 'hub' ? (
    <App start={start} />
  ) : (
    <Gate mode={start.mode} />
  ),
)

// The device view is the next thing a person opens; fetch it once the first screen is up.
if ('requestIdleCallback' in window) requestIdleCallback(preloadDeviceView)
else setTimeout(preloadDeviceView, 1500)

// Offline shell for the installed app. Only where the browser allows it (HTTPS or localhost).
if (import.meta.env.PROD && isSecureContext && 'serviceWorker' in navigator)
  addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'))
