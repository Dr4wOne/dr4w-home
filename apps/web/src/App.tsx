// The hub app: home (devices, scenes, command bar) and a device view per device.
import { DEMO_SCENES } from '@dr4w-home/adapter-demo'
import type { Device } from '@dr4w-home/device-sdk'
import { lazy, Suspense, useState } from 'react'
import { flushSync } from 'react-dom'
import { CommandBar, ConfirmDialog, DeviceRow, HubState, Notice, ScenesStrip } from './parts.tsx'
import type { Start } from './source.ts'
import { type Home, useHome } from './useHome.ts'

const DeviceView = lazy(() => import('./DeviceView.tsx'))
export const preloadDeviceView = () => void import('./DeviceView.tsx')

const DEMO_BANNER =
  'Demo mode: these devices are simulated in your browser. Nothing real is controlled.'
const LINK_COMMAND = 'pnpm --filter @dr4w-home/hub cli link'

/** Shared-element transition where the browser has it; a plain swap where it does not. */
function transition(update: () => void) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduce) return update()
  document.startViewTransition(() => flushSync(update))
}

function Header({
  home,
  demo,
  sound,
  setSound,
}: {
  home?: Home
  demo: boolean
  sound: boolean
  setSound: (s: boolean) => void
}) {
  return (
    <header className="app-head">
      <a className="wordmark" href="/">
        dr4w<span className="wordmark-dot">.</span>home
      </a>
      {home ? <HubState home={home} /> : <span className="hub-state-spacer" />}
      {home && (
        <details className="settings">
          <summary>Settings</summary>
          <div className="settings-body">
            <button
              type="button"
              className="btn"
              aria-pressed={sound}
              onClick={() => setSound(!sound)}
            >
              Click sound {sound ? 'on' : 'off'}
            </button>
            {demo && (
              <button
                type="button"
                className="btn"
                aria-pressed={home.down}
                onClick={() => home.simulateDown(!home.down)}
              >
                {home.down ? 'Bring the hub back' : 'Simulate hub down'}
              </button>
            )}
          </div>
        </details>
      )}
    </header>
  )
}

/** Shown before the app can use a hub: not signed in, or the hub cannot be reached. */
export function Gate({ mode }: { mode: 'signed-out' | 'unreachable' }) {
  return (
    <div className="app">
      <Header demo={false} sound={false} setSound={() => {}} />
      <main className="home gate" aria-labelledby="gate-title">
        {mode === 'signed-out' ? (
          <>
            <h1 id="gate-title" className="home-title">
              Sign this phone in
            </h1>
            <p>
              The hub only answers phones that have signed in once. On the computer that runs the
              hub, run:
            </p>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a block that scrolls must be reachable by keyboard */}
            <pre className="gate-code" tabIndex={0}>
              <code>{LINK_COMMAND}</code>
            </pre>
            <p>
              Scan the code it shows with this phone's camera. The link works once and expires after
              10 minutes.
            </p>
          </>
        ) : (
          <>
            <h1 id="gate-title" className="home-title">
              The hub is out of reach
            </h1>
            <p>
              This phone cannot reach the hub. At home, check the hub computer is on. Away from
              home, turn on your VPN.
            </p>
            <button type="button" className="btn primary" onClick={() => location.reload()}>
              Try again
            </button>
          </>
        )}
      </main>
    </div>
  )
}

export function App({ start }: { start: Extract<Start, { mode: 'demo' | 'hub' }> }) {
  // Demo state exists at once, so the first frame is complete; a hub's state arrives over the network.
  const home = useHome(
    start.source,
    start.mode === 'demo' ? { devices: start.source.devices(), scenes: DEMO_SCENES } : undefined,
  )
  const demo = start.mode === 'demo'
  const [openId, setOpenId] = useState<string>()
  const [sound, setSound] = useState(false)
  const open = home.devices.find((d) => d.id === openId)

  if (home.signedOut) return <Gate mode="signed-out" />

  const openDevice = (d: Device) => transition(() => setOpenId(d.id))
  const back = () => {
    const id = openId
    transition(() => setOpenId(undefined))
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-open="${id}"] .device-open`)?.focus(),
    )
  }

  return (
    <div className={`app${home.down ? ' is-down' : ''}`}>
      <Header home={home} demo={demo} sound={sound} setSound={setSound} />
      {demo && (
        <aside className="demo-banner" aria-label="Demo mode">
          {DEMO_BANNER}
        </aside>
      )}
      {home.down && (
        <div className="down-banner" role="alert">
          <span>The hub is not answering. Showing the last known state; nothing will be sent.</span>
          <button
            type="button"
            className="btn ink"
            onClick={() => (demo ? home.simulateDown(false) : location.reload())}
          >
            Retry
          </button>
        </div>
      )}
      {open ? (
        <Suspense fallback={<main className="sheet" aria-busy="true" />}>
          <DeviceView home={home} d={open} sound={sound} onBack={back} />
        </Suspense>
      ) : (
        <main className="home" aria-labelledby="home-title">
          <h1 id="home-title" className="home-title">
            Living room
          </h1>
          {home.loaded && (
            <>
              <CommandBar home={home} />
              <section aria-labelledby="scenes-title">
                <h2 id="scenes-title" className="group-title">
                  Scenes
                </h2>
                <ScenesStrip home={home} sound={sound} />
              </section>
              <section aria-labelledby="devices-title" aria-busy={!home.loaded}>
                <h2 id="devices-title" className="group-title">
                  Devices
                </h2>
                {home.loaded && !home.devices.length ? (
                  <p className="hint">
                    No devices yet. Pair one on the hub computer with{' '}
                    <code>pnpm --filter @dr4w-home/hub cli pair</code>.
                  </p>
                ) : (
                  <ul className="devices cards">
                    {home.devices.map((d) => (
                      <DeviceRow key={d.id} home={home} d={d} sound={sound} onOpen={openDevice} />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </main>
      )}
      <Notice home={home} />
      <ConfirmDialog home={home} />
    </div>
  )
}
