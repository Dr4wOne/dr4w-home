// Controller geometry, kept pure so it is tested without a browser. A layout's x and y are the
// control's centre as fractions of the landscape surface; size is its diameter as a fraction of the
// surface height (packages/device-sdk/src/presets.ts). A shoulder is a pill twice as wide.
import type { Pad } from '@dr4w-home/client'
import { type Control, GAMEPAD_BUTTONS, mask, NEUTRAL, type PadButton } from '@dr4w-home/device-sdk'

export const STICK_DEAD_ZONE = 0.15
/** Rolls under this many degrees count as straight ahead. */
const TILT_DEAD_DEG = 2

export type Box = { width: number; height: number }
/** One finger: the control it holds (if any) and where it is, in surface pixels. */
export type Touch = { control?: string; x: number; y: number }

export const clampAxis = (n: number) => Math.max(-100, Math.min(100, Math.round(n))) || 0
const isButton = (b: Control['binds']): b is PadButton =>
  (GAMEPAD_BUTTONS as readonly string[]).includes(b)

export function geometry(c: Control, box: Box) {
  const r = (c.size * box.height) / 2
  const shoulder = c.kind === 'shoulder'
  return {
    cx: c.x * box.width,
    cy: c.y * box.height,
    rx: shoulder ? r * 2 : r,
    ry: shoulder ? r * 0.6 : r,
  }
}

/** The control under a point: the one whose centre is relatively closest, inside its outline. */
export function hitTest(controls: readonly Control[], x: number, y: number, box: Box) {
  let best: Control | undefined
  let bestD = 1
  for (const c of controls) {
    const g = geometry(c, box)
    const dx = Math.abs(x - g.cx) / g.rx
    const dy = Math.abs(y - g.cy) / g.ry
    const d = c.kind === 'shoulder' ? Math.max(dx, dy) : Math.hypot(dx, dy)
    if (d <= bestD) {
      best = c
      bestD = d
    }
  }
  return best
}

/**
 * What a finger holds after it moved. A stick keeps its finger wherever it goes; a finger on a
 * button or the D-pad slides onto the next one (slide-press), and lets go between controls.
 */
export function retarget(
  controls: readonly Control[],
  current: string | undefined,
  x: number,
  y: number,
  box: Box,
): string | undefined {
  const cur = controls.find((c) => c.id === current)
  if (cur?.kind === 'stick') return cur.id
  const hit = hitTest(controls, x, y, box)
  if (hit && hit.kind !== 'stick') return hit.id
  if (cur?.kind === 'dpad') {
    const g = geometry(cur, box)
    if (Math.hypot(x - g.cx, y - g.cy) <= g.rx * 1.6) return cur.id
  }
  return undefined
}

/** A stick from the finger's offset to its centre: dead zone, then scaled and clamped to -100..100. */
export function stickValue(dx: number, dy: number, radius: number, dead = STICK_DEAD_ZONE) {
  const nx = dx / radius
  const ny = -dy / radius // screen y grows down; stick up is positive
  const m = Math.hypot(nx, ny)
  if (m < dead) return { x: 0, y: 0 }
  const k = Math.min(1, (m - dead) / (1 - dead)) / m
  return { x: clampAxis(nx * k * 100), y: clampAxis(ny * k * 100) }
}

const DIRS: PadButton[][] = [
  ['dpadRight'],
  ['dpadUp', 'dpadRight'],
  ['dpadUp'],
  ['dpadUp', 'dpadLeft'],
  ['dpadLeft'],
  ['dpadDown', 'dpadLeft'],
  ['dpadDown'],
  ['dpadDown', 'dpadRight'],
]
/** Eight directions, diagonals included; the middle fifth presses nothing. */
export function dpadButtons(dx: number, dy: number, radius: number): PadButton[] {
  if (Math.hypot(dx, dy) < radius * 0.2) return []
  const sector = Math.round(Math.atan2(-dy, dx) / (Math.PI / 4))
  return DIRS[(sector + 8) % 8] ?? []
}

/**
 * Steering from gravity. `gx`, `gy`: accelerationIncludingGravity in device axes; `angle`: the screen
 * orientation angle. Holding the phone like a wheel and turning it clockwise steers right.
 */
export function tiltX(gx: number, gy: number, angle: number, maxDeg: number): number {
  const a = (angle * Math.PI) / 180
  const sx = gx * Math.cos(a) - gy * Math.sin(a)
  const sy = gx * Math.sin(a) + gy * Math.cos(a)
  const deg = (Math.atan2(-sx, sy) * 180) / Math.PI
  return Math.abs(deg) < TILT_DEAD_DEG ? 0 : clampAxis((deg / maxDeg) * 100)
}

/** The whole controller from every finger, plus keys or a macro (`b`) and tilt steering. */
export function frameOf(
  controls: readonly Control[],
  touches: Iterable<Touch>,
  box: Box,
  extra: { b?: number; tiltX?: number } = {},
): Pad {
  let b = extra.b ?? 0
  let left: { x: number; y: number } | undefined
  let right: { x: number; y: number } | undefined
  for (const t of touches) {
    const c = controls.find((x) => x.id === t.control)
    if (!c) continue
    const g = geometry(c, box)
    if (c.kind === 'stick') {
      const v = stickValue(t.x - g.cx, t.y - g.cy, g.rx)
      if (c.binds === 'right') right = v
      else left = v
    } else if (c.kind === 'dpad') b |= mask(dpadButtons(t.x - g.cx, t.y - g.cy, g.rx))
    else if (isButton(c.binds)) b |= mask([c.binds])
  }
  return {
    ...NEUTRAL,
    b,
    // A finger on the left stick overrides tilt, so a fine correction is always possible.
    lx: left?.x ?? extra.tiltX ?? 0,
    ly: left?.y ?? 0,
    rx: right?.x ?? 0,
    ry: right?.y ?? 0,
  }
}

export const samePad = (a: Pad, b: Pad) =>
  a.b === b.b && a.lx === b.lx && a.ly === b.ly && a.rx === b.rx && a.ry === b.ry

/** Short faces drawn on the controls; the spoken names are in `controlName`. */
const FACE: Partial<Record<PadButton, string>> = {
  plus: '+',
  minus: '−',
  home: '⌂',
  capture: '◉',
  lStick: 'LS',
  rStick: 'RS',
  dpadUp: '↑',
  dpadDown: '↓',
  dpadLeft: '←',
  dpadRight: '→',
}
const NAME: Partial<Record<PadButton, string>> = {
  plus: 'Plus',
  minus: 'Minus',
  home: 'Home',
  capture: 'Capture',
  lStick: 'Left stick click',
  rStick: 'Right stick click',
  dpadUp: 'Up',
  dpadDown: 'Down',
  dpadLeft: 'Left',
  dpadRight: 'Right',
}
export const bindName = (b: Control['binds']) =>
  b === 'left'
    ? 'Left stick'
    : b === 'right'
      ? 'Right stick'
      : b === 'dpad'
        ? 'D-pad'
        : (NAME[b] ?? b.toUpperCase())
export const controlFace = (c: Control) =>
  c.label ?? (isButton(c.binds) ? (FACE[c.binds] ?? c.binds.toUpperCase()) : '')
export const controlName = (c: Control) =>
  c.label ? `${c.label} (${bindName(c.binds)})` : bindName(c.binds)
