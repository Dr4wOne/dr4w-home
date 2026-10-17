// How a controller layout looks, shared by the player, the builder and the showcase's virtual screen.
import type { Pad, VirtualPad } from '@dr4w-home/client'
import {
  CONTROLLER_PRESETS,
  type Control,
  mask,
  NEUTRAL,
  type PadButton,
  pressed,
} from '@dr4w-home/device-sdk'
import { type CSSProperties, useSyncExternalStore } from 'react'
import { bindName, controlFace } from './pad.ts'
import { Chevron } from './parts.tsx'

export const padStyle = (c: Control) =>
  ({ '--x': c.x, '--y': c.y, '--s': c.size, opacity: c.opacity }) as CSSProperties

const ARMS = ['dpadUp', 'dpadLeft', 'dpadRight', 'dpadDown'] as const
const DPAD = mask([...ARMS])

export function isDown(c: Control, f: Pad): boolean {
  if (c.kind === 'stick') return c.binds === 'right' ? Boolean(f.rx || f.ry) : Boolean(f.lx || f.ly)
  if (c.kind === 'dpad') return Boolean(f.b & DPAD)
  return Boolean(f.b & mask([c.binds as PadButton]))
}

export const padClass = (c: Control, f: Pad) =>
  `pad-ctl pad-${c.kind}${isDown(c, f) ? ' is-down' : ''}`

/** The inside of one control: a label, a stick thumb at its position, or four D-pad arms. */
export function PadFace({ c, frame }: { c: Control; frame: Pad }) {
  if (c.kind === 'stick') {
    const [x, y] = c.binds === 'right' ? [frame.rx, frame.ry] : [frame.lx, frame.ly]
    return (
      <span
        className="pad-thumb"
        aria-hidden="true"
        style={{ '--tx': x / 100, '--ty': -y / 100 } as CSSProperties}
      />
    )
  }
  if (c.kind === 'dpad')
    return ARMS.map((k) => (
      <span
        key={k}
        aria-hidden="true"
        className={`pad-arm ${k}${frame.b & mask([k]) ? ' is-down' : ''}`}
      >
        <Chevron />
      </span>
    ))
  return (
    <span className="pad-face" aria-hidden="true">
      {controlFace(c)}
    </span>
  )
}

const SCREEN = CONTROLLER_PRESETS[0]?.controls ?? []

/** What the console sees, in plain words: "A, ZR · Left stick 40, -20". */
export function describePad(f: Pad) {
  const parts = [pressed(f.b).map(bindName).join(', ')]
  if (f.lx || f.ly) parts.push(`Left stick ${f.lx}, ${f.ly}`)
  if (f.rx || f.ry) parts.push(`Right stick ${f.rx}, ${f.ry}`)
  return parts.filter(Boolean).join(' · ') || 'Nothing pressed'
}

/** The demo console's screen: every button lights up while it is held, sticks show as dots. */
export function VirtualScreen({ pad, compact }: { pad: VirtualPad; compact?: boolean }) {
  const f = useSyncExternalStore(pad.subscribe, pad.get, () => NEUTRAL)
  return (
    <figure className={`vscreen${compact ? ' is-compact' : ''}`}>
      <div className="vscreen-tv">
        <div className="pad-canvas" role="img" aria-label="Simulated console screen">
          {SCREEN.map((c) => (
            <span key={c.id} className={padClass(c, f)} style={padStyle(c)}>
              <PadFace c={c} frame={f} />
            </span>
          ))}
        </div>
      </div>
      {!compact && <figcaption className="vscreen-read">{describePad(f)}</figcaption>}
    </figure>
  )
}
