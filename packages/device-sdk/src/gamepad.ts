// The live controller contract: what the phone streams to the hub, what the hub hands to an output
// (Bluetooth emulation today, a wired USB bridge later), and the shape of a saved controller layout.
// Live input bypasses the command API on purpose: a frame is a full snapshot, sent many times a second.
/** Bit order of `GamepadFrame.b`. Append only: a reorder breaks phones running an older app. */
export const GAMEPAD_BUTTONS = [
  'a',
  'b',
  'x',
  'y',
  'l',
  'r',
  'zl',
  'zr',
  'plus',
  'minus',
  'home',
  'capture',
  'dpadUp',
  'dpadDown',
  'dpadLeft',
  'dpadRight',
  'lStick',
  'rStick',
] as const
export type PadButton = (typeof GAMEPAD_BUTTONS)[number]

/**
 * One snapshot of the whole controller. `s` counts up per connection; `b` is a bitmask in
 * GAMEPAD_BUTTONS order; sticks are integers from -100 to 100 (up and right are positive).
 */
export type GamepadFrame = { s: number; b: number; lx: number; ly: number; rx: number; ry: number }
export const NEUTRAL: Omit<GamepadFrame, 's'> = { b: 0, lx: 0, ly: 0, rx: 0, ry: 0 }

export const pressed = (b: number): PadButton[] => GAMEPAD_BUTTONS.filter((_, i) => b & (1 << i))
export const mask = (buttons: readonly PadButton[]): number =>
  buttons.reduce((m, k) => m | (1 << GAMEPAD_BUTTONS.indexOf(k)), 0)

/**
 * The phone sends a frame on every change and at least every HEARTBEAT_MS. The hub releases every
 * button and centres the sticks when no frame arrived for WATCHDOG_MS or the socket closes.
 */
export const HEARTBEAT_MS = 40
export const WATCHDOG_MS = 100

/** What drives the console. One per emulated controller. */
export interface GamepadOutput {
  readonly kind: 'demo' | 'bluetooth' | 'usb'
  connect(): Promise<void>
  /** Apply a full snapshot; must not queue stale frames behind newer ones. */
  send(frame: Omit<GamepadFrame, 's'>): void
  /** Same as sending NEUTRAL, but also used on shutdown. */
  release(): void
  close(): Promise<void>
  connected(): boolean
  /** Optional: why `connected()` is false, so the phone can say what to do. */
  waiting?(): GamepadWaiting | undefined
}

/**
 * Why an output does not reach the console: `pair` means the console has to pair with it (on a
 * Switch: Change Grip/Order); `down` means the hub cannot reach what drives it (the sidecar service).
 */
export type GamepadWaiting = 'pair' | 'down'

/** Hub to phone, on the same socket. `ms` is hub receive to output write for frame `s`. */
export type GamepadServerMessage =
  | { t: 'ack'; s: number; ms: number }
  | { t: 'state'; connected: boolean; output: GamepadOutput['kind']; waiting?: GamepadWaiting }
  | { t: 'error'; reason: 'busy' | 'unreachable' | 'invalid'; detail?: string }

// A saved layout from the controller builder. Positions and sizes are fractions of the screen in
// landscape, so one layout fits every phone.
export type ControlKind = 'button' | 'dpad' | 'stick' | 'shoulder'
export type Control = {
  id: string
  kind: ControlKind
  /** The button it presses; for a stick, which stick; for a d-pad, ignored. */
  binds: PadButton | 'left' | 'right' | 'dpad'
  /** The control's centre. */
  x: number
  y: number
  /** Diameter, as a fraction of the screen height. */
  size: number
  opacity: number
  label?: string
}
export type ControllerProfile = {
  id: string
  name: string
  controls: Control[]
  /** Steer the left stick by tilting the phone (iOS asks for motion permission first). */
  tilt?: { stick: 'left'; axis: 'x'; maxDeg: number }
  /** Shown when a macro is used: offline single-player only. */
  macros?: { id: string; label: string; steps: { b: number; ms: number }[] }[]
}
