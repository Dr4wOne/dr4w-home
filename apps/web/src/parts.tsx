// Direction B building blocks shared by the hub app and the showcase.
import { capability, type Device, summary } from '@dr4w-home/device-sdk'
import type { Intent } from '@dr4w-home/intent'
import { useEffect, useId, useRef, useState } from 'react'
import { deviceIcon } from './icons.tsx'
import type { Home } from './useHome.ts'

export function powerOf(d: Device) {
  const p = capability(d, 'power')?.state.power
  return {
    on: Boolean(p?.known && p.value === 'on'),
    assumed: Boolean(p?.known && p.source === 'assumed'),
  }
}

/** The power symbol at any scale: a ring with a gap at the top and the bar through it. */
export function PowerMark({ className, stroke = 14 }: { className?: string; stroke?: number }) {
  const r = 50 - stroke / 2
  const a = (35 * Math.PI) / 180 // the gap: 35° each side of the top
  const x1 = 50 + r * Math.sin(a)
  const y1 = 50 - r * Math.cos(a)
  const x2 = 50 - r * Math.sin(a)
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y1}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
      />
      <rect x={50 - stroke / 2} y={0} width={stroke} height={46} fill="currentColor" />
    </svg>
  )
}

export function Ring({ d, pending }: { d?: Device; pending?: boolean }) {
  if (!d) return <span className="ring" aria-hidden="true" />
  const p = powerOf(d)
  const offline = d.availability.status === 'offline'
  const cls = [
    'ring',
    p.on && 'on',
    p.assumed && 'assumed',
    offline && 'offline',
    pending && 'pending',
  ]
  return <span className={cls.filter(Boolean).join(' ')} aria-hidden="true" />
}

/** "On · Netflix · Volume 18", plus "assumed" when the device cannot confirm it. */
export function stateText(d: Device) {
  return summary(d) || 'Unknown'
}

let audio: AudioContext | undefined
/** A short, quiet click: iOS Safari has no vibration, so feedback is visual and, if wanted, audible. */
export function click(enabled: boolean) {
  if (!enabled) return
  audio ??= new AudioContext()
  const o = audio.createOscillator()
  const g = audio.createGain()
  o.frequency.value = 1400
  g.gain.setValueAtTime(0.06, audio.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.035)
  o.connect(g).connect(audio.destination)
  o.start()
  o.stop(audio.currentTime + 0.04)
}

export function PowerButton({ home, d, sound }: { home: Home; d: Device; sound: boolean }) {
  const p = powerOf(d)
  const offline = d.availability.status === 'offline'
  return (
    <button
      type="button"
      className="power-btn"
      aria-pressed={p.on}
      aria-label={`${d.name}: turn ${p.on ? 'off' : 'on'}`}
      disabled={offline}
      onClick={() => {
        click(sound)
        void home.execute(d.id, { type: 'power', op: 'set', on: !p.on })
      }}
    >
      <Ring d={d} pending={home.isPending(d.id)} />
    </button>
  )
}

export function DeviceRow({
  home,
  d,
  sound,
  onOpen,
}: {
  home: Home
  d: Device
  sound: boolean
  onOpen?: (d: Device) => void
}) {
  const Icon = deviceIcon[d.category]
  const p = powerOf(d)
  const offline = d.availability.status === 'offline'
  const body = (
    <>
      <span className="device-name">{d.name}</span>
      <span className="device-state">
        {stateText(d)}
        {p.assumed && !offline && <span className="assumed-tag"> · assumed</span>}
      </span>
    </>
  )
  return (
    <li
      data-open={d.id}
      className={`device${offline ? ' is-offline' : ''}`}
      style={{ viewTransitionName: onOpen ? `card-${d.id}` : undefined }}
    >
      <Icon className="icon" />
      {onOpen ? (
        <button
          type="button"
          className="device-open"
          onClick={() => onOpen(d)}
          aria-label={`Open ${d.name}. ${stateText(d)}`}
        >
          {body}
        </button>
      ) : (
        <span className="device-open" style={{ cursor: 'default' }}>
          {body}
        </span>
      )}
      <PowerButton home={home} d={d} sound={sound} />
    </li>
  )
}

export function ScenesStrip({ home, sound }: { home: Home; sound: boolean }) {
  return (
    <fieldset className="scenes">
      <legend className="visually-hidden">Scenes</legend>
      {home.scenes.map((s) => {
        const running = home.sceneRun?.id === s.id
        return (
          <button
            key={s.id}
            type="button"
            className="btn"
            aria-busy={running}
            disabled={Boolean(home.sceneRun) && !running}
            onClick={() => {
              click(sound)
              void home.scene(s.id)
            }}
          >
            {s.name}
            {running && home.sceneRun && (
              <span>
                {' '}
                {home.sceneRun.step} of {home.sceneRun.of}
              </span>
            )}
          </button>
        )
      })}
    </fieldset>
  )
}

export function HubState({ home }: { home: Home }) {
  const text = home.down
    ? 'Hub not answering'
    : home.link === 'reconnecting'
      ? 'Reconnecting to the hub'
      : home.source.kind === 'demo'
        ? 'Simulated hub'
        : 'Hub connected'
  return (
    <span
      className={`hub-state${home.down ? ' down' : home.link === 'reconnecting' ? ' wait' : ''}`}
      role="status"
    >
      <span className="dot" aria-hidden="true" />
      {text}
    </span>
  )
}

/** The command bar: type or dictate; with nothing typed it is a palette of every action. */
export function CommandBar({
  home,
  placeholder = 'Say or type: movie night',
  label = 'Command',
}: {
  home: Home
  placeholder?: string
  label?: string
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const id = useId()
  const results: Intent[] = open ? home.intents(text).slice(0, 8) : []
  const run = (i: Intent | undefined) => {
    if (!i) return
    setOpen(false)
    setText('')
    void home.act(i)
  }
  return (
    <form
      className="command"
      onSubmit={(e) => {
        e.preventDefault()
        run(results[active] ?? home.intents(text)[0])
      }}
    >
      <label htmlFor={`${id}-in`} className="visually-hidden">
        {label}
      </label>
      <div className="command-field">
        <input
          id={`${id}-in`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-o${active}` : undefined}
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="go"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Escape') setOpen(false)
          }}
        />
        <button type="submit" className="btn primary command-go">
          Go
        </button>
      </div>
      {open && (
        <div className="options" id={`${id}-list`} role="listbox" aria-label="Actions">
          {results.length ? (
            results.map((r, i) => (
              // biome-ignore lint/a11y/useFocusableInteractive lint/a11y/noNoninteractiveElementToInteractiveRole: options are chosen with aria-activedescendant
              <div
                key={`${r.label}-${i}`}
                id={`${id}-o${i}`}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => {
                  e.preventDefault()
                  run(r)
                }}
                onPointerEnter={() => setActive(i)}
              >
                {r.label}
                <span className="kind">{r.action.kind === 'scene' ? 'Scene' : 'Device'}</span>
              </div>
            ))
          ) : (
            // biome-ignore lint/a11y/useFocusableInteractive lint/a11y/noNoninteractiveElementToInteractiveRole: a disabled "no match" option
            <div className="empty" role="option" aria-selected="false" aria-disabled="true">
              No match. Try a scene name, or "TV off".
            </div>
          )}
        </div>
      )}
    </form>
  )
}

export function Notice({ home }: { home: Home }) {
  const n = home.notice
  const { clearNotice } = home
  useEffect(() => {
    if (!n) return
    const t = setTimeout(clearNotice, 4500)
    return () => clearTimeout(t)
  }, [n, clearNotice])
  return (
    <div
      role={n?.tone === 'error' ? 'alert' : 'status'}
      aria-live={n?.tone === 'error' ? 'assertive' : 'polite'}
    >
      {n && (
        <div className={`notice ${n.tone}`} key={n.id}>
          <span>{n.text}</span>
          <button type="button" onClick={clearNotice} aria-label="Dismiss">
            OK
          </button>
        </div>
      )}
    </div>
  )
}

/** Native modal dialog: the page behind is inert, focus starts on Cancel (the first button), Escape cancels. */
export function ConfirmDialog({ home }: { home: Home }) {
  const ref = useRef<HTMLDialogElement>(null)
  const c = home.confirm
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (c && !d.open) d.showModal()
    if (!c && d.open) d.close()
  }, [c])
  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-text"
      onCancel={(e) => {
        e.preventDefault()
        home.answer(false)
      }}
    >
      {c && (
        <>
          <h2 id="confirm-title">{c.title}</h2>
          <p id="confirm-text">{c.text}</p>
          <div className="confirm-actions">
            <button type="button" className="btn" onClick={() => home.answer(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={() => home.answer(true)}>
              {c.action}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
