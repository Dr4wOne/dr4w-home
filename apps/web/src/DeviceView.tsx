// A device's full control sheet. Loaded on demand, so the home screen ships less script.
import { type Command, capability, type Device, type KeyName } from '@dr4w-home/device-sdk'
import { useEffect, useState } from 'react'
import { ControllerPanel } from './ControllerPanel.tsx'
import { deviceIcon } from './icons.tsx'
import { Chevron, Choice, click, PowerButton, powerOf, stateText } from './parts.tsx'
import type { Home } from './useHome.ts'

function Remote({ d, send, offline }: { d: Device; send: (c: Command) => void; offline: boolean }) {
  const on = powerOf(d).on
  const volume = capability(d, 'volume')
  const mute = capability(d, 'mute')
  const apps = capability(d, 'appLauncher')
  const inputs = capability(d, 'inputSource')
  const level = volume?.state.level.known ? volume.state.level.value : undefined
  const muted = Boolean(mute?.state.muted.known && mute.state.muted.value)
  const current = apps?.state.currentApp.known ? apps.state.currentApp.value?.id : undefined
  const input = inputs?.state.currentInput.known ? inputs.state.currentInput.value : undefined
  const key = (k: KeyName) => send({ type: 'keypad', op: 'press', key: k })
  const dis = !on || offline
  return (
    <div className="remote">
      {!on && !offline && <p className="hint">The TV is off. Turn it on to use the remote.</p>}
      <fieldset className="pad">
        <legend className="visually-hidden">Navigation</legend>
        <button
          type="button"
          className="pad-btn up"
          aria-label="Up"
          disabled={dis}
          onClick={() => key('up')}
        >
          <Chevron />
        </button>
        <button
          type="button"
          className="pad-btn left"
          aria-label="Left"
          disabled={dis}
          onClick={() => key('left')}
        >
          <Chevron />
        </button>
        <button type="button" className="pad-ok" disabled={dis} onClick={() => key('select')}>
          OK
        </button>
        <button
          type="button"
          className="pad-btn right"
          aria-label="Right"
          disabled={dis}
          onClick={() => key('right')}
        >
          <Chevron />
        </button>
        <button
          type="button"
          className="pad-btn down"
          aria-label="Down"
          disabled={dis}
          onClick={() => key('down')}
        >
          <Chevron />
        </button>
      </fieldset>
      <div className="remote-side">
        <fieldset className="row3">
          <legend className="visually-hidden">Menu</legend>
          <button type="button" className="btn" disabled={dis} onClick={() => key('back')}>
            Back
          </button>
          <button type="button" className="btn" disabled={dis} onClick={() => key('home')}>
            Home
          </button>
          <button type="button" className="btn" disabled={dis} onClick={() => key('playPause')}>
            Play/Pause
          </button>
        </fieldset>
        {volume && (
          <fieldset className="row3 volume">
            <legend className="visually-hidden">Volume</legend>
            <button
              type="button"
              className="btn"
              aria-label="Volume down"
              disabled={dis}
              onClick={() => send({ type: 'volume', op: 'step', direction: 'down' })}
            >
              −
            </button>
            <button
              type="button"
              className="btn level"
              aria-pressed={muted}
              aria-label={muted ? 'Muted. Unmute' : `Volume ${level ?? 'unknown'}. Mute`}
              disabled={dis}
              onClick={() => send({ type: 'mute', op: 'set', muted: !muted })}
            >
              {muted ? 'Muted' : (level ?? '–')}
            </button>
            <button
              type="button"
              className="btn"
              aria-label="Volume up"
              disabled={dis}
              onClick={() => send({ type: 'volume', op: 'step', direction: 'up' })}
            >
              +
            </button>
          </fieldset>
        )}
        {apps && (
          <div className="group">
            <h2 className="group-title">Apps</h2>
            <div className="grid2">
              {apps.features.catalog
                .filter((a) => a.id !== 'home')
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="btn"
                    aria-pressed={current === a.id}
                    disabled={dis}
                    onClick={() => send({ type: 'appLauncher', op: 'launch', appId: a.id })}
                  >
                    {a.name}
                  </button>
                ))}
            </div>
          </div>
        )}
        {inputs && (
          <div className="group">
            <h2 className="group-title">Input</h2>
            <div className="grid-inputs">
              {inputs.features.inputs.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className="btn"
                  aria-pressed={input === i.id}
                  disabled={dis}
                  onClick={() => send({ type: 'inputSource', op: 'select', inputId: i.id })}
                >
                  {i.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onCommit,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (n: number) => string
  onCommit: (n: number) => void
  disabled?: boolean
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  const commit = () => local !== value && onCommit(local)
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{label}</span>
        <output>{format(local)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        disabled={disabled}
        aria-valuetext={format(local)}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  )
}

function LampControls({
  d,
  send,
  disabled,
}: {
  d: Device
  send: (c: Command) => void
  disabled: boolean
}) {
  const level = capability(d, 'lightLevel')
  const color = capability(d, 'lightColor')
  return (
    <div className="lamp">
      {level && (
        <Slider
          label="Brightness"
          value={level.state.level.known ? level.state.level.value : 50}
          min={1}
          max={100}
          step={1}
          format={(n) => `${n}%`}
          disabled={disabled}
          onCommit={(n) => send({ type: 'lightLevel', op: 'set', level: n })}
        />
      )}
      {color && (
        <Slider
          label="Warmth"
          value={color.state.kelvin.known ? color.state.kelvin.value : 2700}
          min={color.features.ctMinK}
          max={color.features.ctMaxK}
          step={100}
          format={(k) => `${k} K, ${k < 3300 ? 'warm' : k < 4800 ? 'neutral' : 'cool'}`}
          disabled={disabled}
          onCommit={(k) => send({ type: 'lightColor', op: 'set', kelvin: k })}
        />
      )}
    </div>
  )
}

/** Separate on and off buttons for a device that cannot report its power state (as Home Assistant does). */
function AssumedPower({
  d,
  send,
  disabled,
}: {
  d: Device
  send: (c: Command) => void
  disabled: boolean
}) {
  const p = powerOf(d)
  const act = capability(d, 'activity')?.state.title
  const via = capability(d, 'power')?.via
  return (
    <div className="console">
      <fieldset className="row2">
        <legend className="visually-hidden">Power</legend>
        <button
          type="button"
          className="btn"
          aria-pressed={p.on}
          disabled={disabled}
          onClick={() => send({ type: 'power', op: 'set', on: true })}
        >
          Turn on
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={!p.on}
          disabled={disabled}
          onClick={() => send({ type: 'power', op: 'set', on: false })}
        >
          Turn off
        </button>
      </fieldset>
      <p className="hint">
        {act?.known ? `${act.value}, assumed. ` : ''}
        {via
          ? 'This device is switched through another device and cannot report back, so its state is assumed.'
          : 'This device cannot report back, so its state is assumed.'}
      </p>
    </div>
  )
}

/** Controls generated from a device's capabilities, for every device without a custom widget. */
function CapabilityControls({
  d,
  send,
  disabled,
}: {
  d: Device
  send: (c: Command) => void
  disabled: boolean
}) {
  const mode = capability(d, 'mode')
  const input = capability(d, 'inputSource')
  return (
    <div className="caps">
      {powerOf(d).assumed && <AssumedPower d={d} send={send} disabled={disabled} />}
      <LampControls d={d} send={send} disabled={disabled} />
      {mode && (
        <Choice
          label={mode.label ?? 'Mode'}
          options={mode.features.options}
          current={mode.state.mode.known ? mode.state.mode.value : undefined}
          disabled={disabled}
          onPick={(modeId) => send({ type: 'mode', op: 'set', modeId })}
        />
      )}
      {input && (
        <Choice
          label={input.label ?? 'Input'}
          options={input.features.inputs}
          current={input.state.currentInput.known ? input.state.currentInput.value : undefined}
          disabled={disabled}
          onPick={(inputId) => send({ type: 'inputSource', op: 'select', inputId })}
        />
      )}
    </div>
  )
}

export default function DeviceView({
  home,
  d,
  sound,
  onBack,
}: {
  home: Home
  d: Device
  sound: boolean
  onBack: () => void
}) {
  const Icon = deviceIcon[d.category]
  const offline = d.availability.status === 'offline'
  const send = (c: Command) => {
    click(sound)
    void home.execute(d.id, c)
  }
  useEffect(() => {
    document.getElementById('device-title')?.focus()
    // The controller's player and builder handle their own Escape.
    const esc = (e: KeyboardEvent) =>
      e.key === 'Escape' && !document.querySelector('.player, .builder') && onBack()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [onBack])
  const p = powerOf(d)
  return (
    <main
      className={`sheet sheet-${d.category}`}
      style={{ viewTransitionName: `card-${d.id}` }}
      aria-labelledby="device-title"
    >
      <div className="sheet-head">
        <button type="button" className="btn back" onClick={onBack}>
          <span aria-hidden="true">←</span> Home
        </button>
        <div className="sheet-title">
          <Icon size={28} />
          <div>
            <h1 id="device-title" tabIndex={-1}>
              {d.name}
            </h1>
            <p className="sheet-state" aria-live="polite">
              {stateText(d)}
              {p.assumed && !offline && <span className="assumed-tag"> · assumed</span>}
            </p>
          </div>
        </div>
        {capability(d, 'power') && !p.assumed && <PowerButton home={home} d={d} sound={sound} />}
      </div>
      {offline && <p className="hint">This device is offline. Controls come back when it does.</p>}
      {/* The remote is the one custom widget; everything else is generated from capabilities. */}
      {capability(d, 'keypad') ? (
        <Remote d={d} send={send} offline={offline} />
      ) : (
        <CapabilityControls d={d} send={send} disabled={offline} />
      )}
      {capability(d, 'gamepad') && (
        <section aria-labelledby="controller-title">
          <h2 id="controller-title" className="group-title">
            {capability(d, 'gamepad')?.label ?? 'Controller'}
          </h2>
          <ControllerPanel
            source={home.source}
            deviceId={d.id}
            sound={sound}
            disabled={offline || home.down}
          />
        </section>
      )}
      <p className="works-with">{d.worksWith}</p>
    </main>
  )
}
