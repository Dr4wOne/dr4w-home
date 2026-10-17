// The controller you play with: full screen, landscape, every finger tracked on its own.
// Loaded on demand from the device view and the showcase. Guide: docs/controller.md.
import type { GamepadSession, GamepadStatus, HomeSource, Pad } from '@dr4w-home/client'
import { type ControllerProfile, mask, NEUTRAL, type PadButton } from '@dr4w-home/device-sdk'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import './controller.css'
import { PadFace, padClass, padStyle } from './PadFace.tsx'
import { frameOf, hitTest, retarget, samePad, type Touch, tiltX } from './pad.ts'
import { click } from './parts.tsx'

/** A keyboard for testing and for people who cannot use a touch screen. */
const KEYS: Record<string, PadButton> = {
  ArrowUp: 'dpadUp',
  ArrowDown: 'dpadDown',
  ArrowLeft: 'dpadLeft',
  ArrowRight: 'dpadRight',
  a: 'a',
  b: 'b',
  x: 'x',
  y: 'y',
  l: 'l',
  r: 'r',
  Enter: 'plus',
}

const OUTPUT: Record<string, string> = { demo: 'Simulated', bluetooth: 'Bluetooth', usb: 'USB' }

function statusText(s: GamepadStatus): { text: string; tone: 'ok' | 'wait' | 'bad' } {
  if (s.state === 'busy') return { text: 'Another phone is using this controller', tone: 'bad' }
  if (s.state === 'error')
    return {
      text: s.detail === 'unreachable' ? 'The console is out of reach' : 'The hub refused input',
      tone: 'bad',
    }
  if (s.state === 'closed') return { text: 'Paused', tone: 'wait' }
  if (s.state === 'connecting') return { text: 'Connecting…', tone: 'wait' }
  if (s.outputConnected === false)
    return { text: 'Hub connected, console not paired', tone: 'wait' }
  const parts = ['Connected']
  if (s.output) parts.push(OUTPUT[s.output] ?? s.output)
  if (s.latencyMs !== undefined) parts.push(`${s.latencyMs} ms`)
  return { text: parts.join(' · '), tone: 'ok' }
}

type DeviceMotionWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}
type Tilt = 'ask' | 'on' | 'off' | 'denied'

export default function Player({
  source,
  deviceId,
  profile,
  sound,
  onExit,
  preview,
}: {
  source: Pick<HomeSource, 'gamepad'>
  deviceId: string
  profile: ControllerProfile
  sound: boolean
  onExit: () => void
  /** Demo mode: a small virtual screen in the bar, so the input is visible while playing. */
  preview?: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const session = useRef<GamepadSession>(undefined)
  const touches = useRef(new Map<number, Touch>())
  const keys = useRef(new Set<PadButton>())
  const tiltValue = useRef<number>(undefined)
  const macroB = useRef(0)
  const macroTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const last = useRef<Pad>({ ...NEUTRAL })
  const [frame, setFrame] = useState<Pad>({ ...NEUTRAL })
  const [status, setStatus] = useState<GamepadStatus>({ state: 'connecting' })
  const [tilt, setTilt] = useState<Tilt>(profile.tilt ? 'ask' : 'off')
  const [macros, setMacros] = useState<'closed' | 'list' | string>('closed')
  const [running, setRunning] = useState<string>()

  useEffect(() => {
    const s = source.gamepad(deviceId)
    session.current = s
    setStatus(s.status())
    const off = s.subscribe(setStatus)
    return () => {
      off()
      s.close()
      session.current = undefined
    }
  }, [source, deviceId])

  const box = () => {
    const r = surface.current?.getBoundingClientRect()
    return r?.width ? r : { left: 0, top: 0, width: 1, height: 1 }
  }

  /** Recompute the whole controller and send it; the visual state follows in the same frame. */
  const update = useCallback(() => {
    const next = frameOf(profile.controls, touches.current.values(), box(), {
      b: mask([...keys.current]) | macroB.current,
      tiltX: tiltValue.current,
    })
    if (samePad(next, last.current)) return
    if (next.b & ~last.current.b) click(sound)
    last.current = next
    session.current?.send(next)
    setFrame(next)
  }, [profile, sound])

  const stopMacro = useCallback(() => {
    clearTimeout(macroTimer.current)
    macroB.current = 0
    setRunning(undefined)
  }, [])

  const releaseAll = useCallback(() => {
    touches.current.clear()
    keys.current.clear()
    stopMacro()
    update()
  }, [update, stopMacro])

  const exit = useCallback(() => {
    releaseAll()
    session.current?.release()
    onExit()
  }, [releaseAll, onExit])

  useEffect(() => root.current?.focus(), [])

  // Full screen, landscape and an awake screen, where the browser allows each; all undone on exit.
  useEffect(() => {
    const el = document.documentElement
    if (!document.fullscreenElement)
      el.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {})
    const orientation = globalThis.screen?.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined
    orientation?.lock?.('landscape').catch(() => {})
    let lock: WakeLockSentinel | undefined
    const wake = () =>
      navigator.wakeLock
        ?.request('screen')
        .then((l) => {
          lock = l
        })
        .catch(() => {})
    void wake()
    const onVisible = () => document.visibilityState === 'visible' && void wake()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
      orientation?.unlock?.()
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  // Anything that takes the page away lets go of every button.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && releaseAll()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return exit()
      const k = KEYS[e.key]
      const target = e.target as Element | null
      if (!k || target?.closest?.('input, select, textarea')) return
      if (e.key === 'Enter' && target?.closest?.('button')) return
      e.preventDefault()
      if (e.type === 'keydown') keys.current.add(k)
      else keys.current.delete(k)
      update()
    }
    document.addEventListener('visibilitychange', onHide)
    addEventListener('blur', releaseAll)
    addEventListener('pagehide', releaseAll)
    addEventListener('keydown', onKey)
    addEventListener('keyup', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      removeEventListener('blur', releaseAll)
      removeEventListener('pagehide', releaseAll)
      removeEventListener('keydown', onKey)
      removeEventListener('keyup', onKey)
    }
  }, [releaseAll, exit, update])

  // Tilt steering: roll of the phone, held like a wheel, drives the left stick's x.
  useEffect(() => {
    if (tilt !== 'on' || !profile.tilt) return
    const maxDeg = profile.tilt.maxDeg
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity
      if (g?.x == null || g.y == null) return
      const angle =
        globalThis.screen?.orientation?.angle ??
        Number((globalThis as { orientation?: number }).orientation ?? 0)
      const v = tiltX(g.x, g.y, angle, maxDeg)
      if (v === tiltValue.current) return
      tiltValue.current = v
      update()
    }
    addEventListener('devicemotion', onMotion)
    return () => {
      removeEventListener('devicemotion', onMotion)
      tiltValue.current = undefined
      update()
    }
  }, [tilt, profile.tilt, update])

  const askTilt = async () => {
    const DM = (globalThis as { DeviceMotionEvent?: DeviceMotionWithPermission }).DeviceMotionEvent
    if (!DM) return setTilt('denied')
    if (typeof DM.requestPermission === 'function') {
      const answer = await DM.requestPermission().catch(() => 'denied' as const)
      if (answer !== 'granted') return setTilt('denied')
    }
    setTilt('on')
  }

  const runMacro = (id: string) => {
    const m = profile.macros?.find((x) => x.id === id)
    setMacros('closed')
    if (!m) return
    stopMacro()
    setRunning(m.label)
    let i = 0
    const step = () => {
      const s = m.steps[i++]
      if (!s) {
        stopMacro()
        update()
        return
      }
      macroB.current = s.b
      update()
      macroTimer.current = setTimeout(step, s.ms)
    }
    step()
  }
  useEffect(() => () => clearTimeout(macroTimer.current), [])

  const at = (e: React.PointerEvent) => {
    const r = box()
    return { x: e.clientX - r.left, y: e.clientY - r.top, r }
  }
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    // Mouse and pen keep their moves inside the surface; touch is captured by the browser already.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {}
    const { x, y, r } = at(e)
    touches.current.set(e.pointerId, { control: hitTest(profile.controls, x, y, r)?.id, x, y })
    update()
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = touches.current.get(e.pointerId)
    if (!t) return
    const { x, y, r } = at(e)
    touches.current.set(e.pointerId, {
      control: retarget(profile.controls, t.control, x, y, r),
      x,
      y,
    })
    update()
  }
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!touches.current.delete(e.pointerId)) return
    update()
  }

  const st = statusText(status)
  const macro = profile.macros?.find((m) => m.id === macros)
  return (
    <div
      ref={root}
      tabIndex={-1}
      className="player"
      role="dialog"
      aria-modal="true"
      aria-label={`Controller: ${profile.name}`}
    >
      <div className="player-bar">
        <span className="player-strip" role="status">
          <span className={`dot ${st.tone}`} aria-hidden="true" />
          {st.text}
          {running && <span> · Macro: {running}</span>}
        </span>
        {preview && <div className="player-preview">{preview}</div>}
        {profile.tilt && tilt !== 'ask' && (
          <button
            type="button"
            className="btn"
            aria-pressed={tilt === 'on'}
            onClick={() => (tilt === 'on' ? setTilt('off') : void askTilt())}
          >
            Tilt {tilt === 'on' ? 'on' : 'off'}
          </button>
        )}
        {Boolean(profile.macros?.length) && (
          <button type="button" className="btn" onClick={() => setMacros('list')}>
            Macros
          </button>
        )}
        <button type="button" className="btn ink" onClick={exit}>
          Done
        </button>
      </div>
      {tilt === 'denied' && (
        <p className="player-note">
          Motion access is off, so tilt steering is off. Steer with the stick.
        </p>
      )}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a multi-touch surface; keys are on the window */}
      <div
        ref={surface}
        className="pad-canvas player-surface"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={releaseAll}
        onContextMenu={(e) => e.preventDefault()}
      >
        {profile.controls.map((c) => (
          <span key={c.id} data-control={c.id} className={padClass(c, frame)} style={padStyle(c)}>
            <PadFace c={c} frame={frame} />
          </span>
        ))}
      </div>
      <p className="player-rotate">Turn your phone on its side to play.</p>

      {tilt === 'ask' && (
        <section className="player-sheet" aria-labelledby="tilt-title">
          <h2 id="tilt-title">Steer by tilting the phone?</h2>
          <p>
            Hold the phone like a wheel and turn it to steer. Your browser asks for access to the
            motion sensors first; only the steering angle goes to the hub.
          </p>
          <div className="row2">
            <button type="button" className="btn" onClick={() => setTilt('off')}>
              Use the stick
            </button>
            <button type="button" className="btn primary" onClick={() => void askTilt()}>
              Use tilt
            </button>
          </div>
        </section>
      )}

      {macros !== 'closed' && (
        <section className="player-sheet" aria-labelledby="macro-title">
          <h2 id="macro-title">{macro ? `Run “${macro.label}”?` : 'Macros'}</h2>
          <p className="macro-warn">Offline single-player only.</p>
          {macro ? (
            <>
              <p>
                It presses {macro.steps.length} steps for you, about{' '}
                {Math.max(1, Math.round(macro.steps.reduce((n, s) => n + s.ms, 0) / 1000))} s. Touch
                Done to stop it.
              </p>
              <div className="row2">
                <button type="button" className="btn" onClick={() => setMacros('list')}>
                  Cancel
                </button>
                <button type="button" className="btn primary" onClick={() => runMacro(macro.id)}>
                  Run
                </button>
              </div>
            </>
          ) : (
            <div className="row2">
              {profile.macros?.map((m) => (
                <button key={m.id} type="button" className="btn" onClick={() => setMacros(m.id)}>
                  {m.label}
                </button>
              ))}
              <button type="button" className="btn" onClick={() => setMacros('closed')}>
                Close
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
