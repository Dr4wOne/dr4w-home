// The adapter contract and the capability model. Design notes and the Matter / Home Assistant
// mapping behind each type: docs/capability-model.md.

import type { GamepadOutput, PadButton } from './gamepad.ts'

export * from './gamepad.ts'
export * from './presets.ts'

/** Where a value came from: read back from the device, or set by us and not yet confirmed. */
export type Source = 'reported' | 'assumed'
export type Value<T> = { known: true; value: T; source: Source; at: number } | { known: false }

export const reported = <T>(value: T, at = Date.now()): Value<T> => ({
  known: true,
  value,
  source: 'reported',
  at,
})
export const assumed = <T>(value: T, at = Date.now()): Value<T> => ({
  known: true,
  value,
  source: 'assumed',
  at,
})
export const unknown: Value<never> = { known: false }

export type Danger = 'none' | 'confirm' | 'blocked'

export type Availability = {
  status: 'online' | 'offline' | 'unknown'
  lastSeenAt?: number
  reason?: string
}

export type KeyName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'back'
  | 'home'
  | 'menu'
  | 'playPause'

type Base<T extends string, F, S> = {
  id: string
  type: T
  label?: string
  features: F
  state: S
  /** Delegated: another device carries out this capability (for example power over HDMI-CEC). */
  via?: { deviceId: string; capabilityId: string }
}

export type PowerCap = Base<
  'power',
  { wakeOnLan?: boolean },
  { power: Value<'on' | 'off' | 'standby'> }
>
export type VolumeCap = Base<
  'volume',
  { absolute: boolean; step: boolean; max: number },
  { level: Value<number> }
>
export type MuteCap = Base<'mute', Record<string, never>, { muted: Value<boolean> }>
export type KeypadCap = Base<'keypad', { keys: KeyName[] }, Record<string, never>>
export type App = { id: string; name: string }
export type AppLauncherCap = Base<
  'appLauncher',
  { catalog: App[] },
  { currentApp: Value<App | null> }
>
export type Input = { id: string; name: string; kind: 'hdmi' | 'usb' | 'internal' | 'other' }
export type InputSourceCap = Base<
  'inputSource',
  { inputs: Input[] },
  { currentInput: Value<string> }
>
/** One of a fixed set of named settings: fan speed, picture mode, wash programme (Matter Mode Select). */
export type Mode = { id: string; name: string }
export type ModeCap = Base<'mode', { options: Mode[] }, { mode: Value<string> }>
export type ActivityCap = Base<
  'activity',
  Record<string, never>,
  { activity: Value<'idle' | 'playing' | 'menu'>; title: Value<string> }
>
export type LightLevelCap = Base<
  'lightLevel',
  { min: number; max: number },
  { level: Value<number> }
>
export type LightColorCap = Base<
  'lightColor',
  { ctMinK: number; ctMaxK: number },
  { kelvin: Value<number> }
>
export type GamepadButton = PadButton
export type GamepadCap = Base<
  'gamepad',
  { layout: 'switch-pro'; buttons: GamepadButton[] },
  { connected: Value<boolean> }
>

export type Capability =
  | PowerCap
  | VolumeCap
  | MuteCap
  | KeypadCap
  | AppLauncherCap
  | InputSourceCap
  | ModeCap
  | ActivityCap
  | LightLevelCap
  | LightColorCap
  | GamepadCap
export type CapabilityType = Capability['type']

export type Command =
  | { type: 'power'; op: 'set'; on: boolean }
  | { type: 'volume'; op: 'set'; level: number }
  | { type: 'volume'; op: 'step'; direction: 'up' | 'down' }
  | { type: 'mute'; op: 'set'; muted: boolean }
  | { type: 'keypad'; op: 'press'; key: KeyName }
  | { type: 'appLauncher'; op: 'launch'; appId: string }
  | { type: 'inputSource'; op: 'select'; inputId: string }
  | { type: 'mode'; op: 'set'; modeId: string }
  | { type: 'lightLevel'; op: 'set'; level: number }
  | { type: 'lightColor'; op: 'set'; kelvin: number }

export type CommandResult =
  | { ok: true; applied: 'confirmed' | 'assumed'; ms: number }
  | {
      ok: false
      reason:
        | 'unsupported'
        | 'invalidState'
        | 'unreachable'
        | 'timeout'
        | 'needsConfirmation'
        | 'blocked'
        | 'rejected'
      detail?: string
      ms: number
    }

export type DeviceCategory = 'tv' | 'console' | 'light' | 'speaker' | 'fan' | 'other'

export type Device = {
  id: string
  name: string
  room?: string
  category: DeviceCategory
  /** Plain text, never a brand logo: "Works with Android TV". */
  worksWith: string
  availability: Availability
  capabilities: Capability[]
}

export type AdapterManifest = {
  id: string
  name: string
  worksWith: string
  categories: DeviceCategory[]
  capabilities: CapabilityType[]
}

/** What every device adapter implements. The hub owns routing, scenes and the UI. */
export interface DeviceAdapter {
  readonly manifest: AdapterManifest
  devices(): Device[]
  subscribe(listener: (device: Device) => void): () => void
  execute(
    deviceId: string,
    command: Command,
    opts?: { confirmed?: boolean },
  ): Promise<CommandResult>
  /** Pure: how dangerous is this command for this device right now. */
  danger(device: Device, command: Command): Danger
  health(): Promise<{ ok: boolean; detail?: string }>
  discover?(): Promise<{ id: string; name: string; address: string }[]>
  /** The live controller output of a device with a `gamepad` capability (GET /api/gamepad/:id). */
  gamepad?(deviceId: string): GamepadOutput | undefined
  pair?(address: string, code: () => Promise<string>): Promise<void>
  close?(): Promise<void>
}

export type SceneStep = { deviceId: string; command: Command; settleMs?: number }
export type Scene = { id: string; name: string; synonyms?: string[]; steps: SceneStep[] }

export function capability<T extends CapabilityType>(
  device: Device,
  type: T,
): Extract<Capability, { type: T }> | undefined {
  return device.capabilities.find((c) => c.type === type) as
    | Extract<Capability, { type: T }>
    | undefined
}

/** One-line state for cards and screen readers: "On · YouTube · Volume 18". */
export function summary(device: Device): string {
  if (device.availability.status === 'offline') return 'Offline'
  const parts: string[] = []
  const power = capability(device, 'power')?.state.power
  if (power?.known) parts.push(power.value === 'on' ? 'On' : 'Off')
  if (power?.known && power.value !== 'on') return parts.join(' · ')
  const app = capability(device, 'appLauncher')?.state.currentApp
  if (app?.known && app.value) parts.push(app.value.name)
  const activity = capability(device, 'activity')?.state.title
  if (activity?.known) parts.push(activity.value)
  const mode = capability(device, 'mode')
  if (mode?.state.mode.known) {
    const id = mode.state.mode.value
    parts.push(mode.features.options.find((o) => o.id === id)?.name ?? id)
  }
  const level = capability(device, 'lightLevel')?.state.level
  if (level?.known) parts.push(`${level.value}%`)
  const muted = capability(device, 'mute')?.state.muted
  const volume = capability(device, 'volume')?.state.level
  if (muted?.known && muted.value) parts.push('Muted')
  else if (volume?.known) parts.push(`Volume ${volume.value}`)
  return parts.join(' · ')
}

/** Run a scene step by step; stops at the first failure and says which step failed. */
export async function runScene(
  scene: Scene,
  execute: (deviceId: string, command: Command) => Promise<CommandResult>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ ok: boolean; results: CommandResult[]; failedStep?: number }> {
  const results: CommandResult[] = []
  for (const [i, step] of scene.steps.entries()) {
    const r = await execute(step.deviceId, step.command)
    results.push(r)
    if (!r.ok) return { ok: false, results, failedStep: i }
    if (step.settleMs) await wait(step.settleMs)
  }
  return { ok: true, results }
}

/**
 * The state a command should produce, marked `assumed`, for optimistic UI. The hub or UI shows it
 * at once and replaces it with the device's report, or rolls back if the command fails.
 */
export function predict(device: Device, command: Command, at = Date.now()): Device {
  const next = structuredClone(device)
  const set = <T extends CapabilityType>(
    type: T,
    state: Extract<Capability, { type: T }>['state'],
  ) => {
    const cap = next.capabilities.find((c) => c.type === type)
    if (cap) cap.state = state as never
  }
  switch (command.type) {
    case 'power':
      set('power', { power: assumed(command.on ? 'on' : 'off', at) })
      break
    case 'volume': {
      const v = capability(device, 'volume')
      const cur = v?.state.level.known ? v.state.level.value : 0
      const level =
        command.op === 'set' ? command.level : cur + (command.direction === 'up' ? 1 : -1)
      set('volume', { level: assumed(Math.max(0, Math.min(v?.features.max ?? 100, level)), at) })
      break
    }
    case 'mute':
      set('mute', { muted: assumed(command.muted, at) })
      break
    case 'appLauncher': {
      const app = capability(device, 'appLauncher')?.features.catalog.find(
        (a) => a.id === command.appId,
      )
      if (app) set('appLauncher', { currentApp: assumed(app, at) })
      break
    }
    case 'inputSource':
      set('inputSource', { currentInput: assumed(command.inputId, at) })
      break
    case 'mode':
      set('mode', { mode: assumed(command.modeId, at) })
      break
    case 'lightLevel':
      set('lightLevel', { level: assumed(command.level, at) })
      break
    case 'lightColor':
      set('lightColor', { kelvin: assumed(command.kelvin, at) })
      break
    case 'keypad':
      break
  }
  return next
}
