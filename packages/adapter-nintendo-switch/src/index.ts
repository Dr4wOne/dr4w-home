// Nintendo Switch 2 adapter. The console has no LAN API (docs/discovery.md), so it works through the
// TV it is docked to: power on is "TV on, then the console's input", power off is left to the
// console's Match TV Power State, and on-screen state is assumed. Live input goes to a GamepadOutput.
import {
  type AdapterManifest,
  assumed,
  type Capability,
  type Command,
  type CommandResult,
  capability,
  type Danger,
  type Device,
  type DeviceAdapter,
  GAMEPAD_BUTTONS,
  type GamepadOutput,
  reported,
  unknown,
} from '@dr4w-home/device-sdk'
import { BluetoothSidecarOutput, DemoOutput, type Log } from './outputs.ts'

export { BluetoothSidecarOutput, DemoOutput } from './outputs.ts'

export type OutputConfig = { kind: 'demo' } | { kind: 'bluetooth'; socket: string }
export type SwitchDeviceConfig = {
  id: string
  name: string
  room?: string
  /** The TV the console is docked to, and the TV input it is plugged into. */
  tvDeviceId: string
  tvInputId: string
  /** The TV app id that means "an external input is on screen" (the TV's own input app). */
  tvInputAppId: string
  output: OutputConfig
}

/** The rest of the hub, as this adapter sees it: the TV's state and a way to command it. */
export type Hub = {
  devices(): Device[]
  subscribe(listener: (d: Device) => void): () => void
  execute(deviceId: string, command: Command): Promise<CommandResult>
}

export const manifest: AdapterManifest = {
  id: 'nintendo-switch',
  name: 'Nintendo Switch 2',
  worksWith: 'Works with Nintendo Switch 2 (through the TV and an emulated controller)',
  categories: ['console'],
  capabilities: ['power', 'activity', 'gamepad'],
}

export function makeOutput(o: OutputConfig, log?: Log): GamepadOutput {
  // shortcut: no USB bridge output yet; add { kind: 'usb', … } here once the wired bridge is verified.
  return o.kind === 'bluetooth'
    ? new BluetoothSidecarOutput({ path: o.socket, ...(log ? { log } : {}) })
    : new DemoOutput()
}

type Console = {
  cfg: SwitchDeviceConfig
  output: GamepadOutput
  /** The hub selected the console's input and the TV has not left it since. */
  selectedAt: number | undefined
  sawInput: boolean
  connected: boolean
}

/** The console as the hub sees it. Pure, for tests. */
export function toDevice(
  cfg: SwitchDeviceConfig,
  tv: Device | undefined,
  selectedAt: number | undefined,
  connected: boolean,
  at = Date.now(),
): Device {
  const tvPower = tv && capability(tv, 'power')?.state.power
  const app = tv && capability(tv, 'appLauncher')?.state.currentApp
  const tvOff = !!tvPower?.known && tvPower.value !== 'on'
  const tvOn = !!tvPower?.known && tvPower.value === 'on'
  const onScreen =
    selectedAt !== undefined && tvOn && !!app?.known && app.value?.id === cfg.tvInputAppId
  const caps: Capability[] = [
    {
      id: 'power',
      type: 'power',
      features: {},
      // Match TV Power State sleeps the console when the TV turns off.
      state: {
        power: tvOff
          ? assumed('off', tvPower.at)
          : tvOn && selectedAt !== undefined
            ? assumed('on', selectedAt)
            : unknown,
      },
      via: { deviceId: cfg.tvDeviceId, capabilityId: 'power' },
    },
    {
      id: 'activity',
      type: 'activity',
      features: {},
      state: onScreen
        ? { activity: assumed('playing', at), title: assumed('On screen', at) }
        : tvOff
          ? { activity: assumed('idle', tvPower.at), title: unknown }
          : { activity: unknown, title: unknown },
    },
    {
      id: 'gamepad',
      type: 'gamepad',
      features: { layout: 'switch-pro', buttons: [...GAMEPAD_BUTTONS] },
      state: { connected: reported(connected, at) },
    },
  ]
  return {
    id: cfg.id,
    name: cfg.name,
    ...(cfg.room ? { room: cfg.room } : {}),
    category: 'console',
    worksWith: manifest.worksWith,
    availability: connected
      ? { status: 'online', lastSeenAt: at }
      : { status: 'unknown', reason: 'Controller not connected' },
    capabilities: caps,
  }
}

export type SwitchOptions = {
  hub: Hub
  log?: Log
  makeOutput?: (o: OutputConfig) => GamepadOutput
  pollMs?: number
}

export class NintendoSwitchAdapter implements DeviceAdapter {
  readonly manifest = manifest
  #consoles = new Map<string, Console>()
  #listeners = new Set<(d: Device) => void>()
  #hub: Hub
  #poll: ReturnType<typeof setInterval>
  #off: () => void

  constructor(devices: SwitchDeviceConfig[], opts: SwitchOptions) {
    this.#hub = opts.hub
    for (const cfg of devices) {
      const output = (opts.makeOutput ?? ((o) => makeOutput(o, opts.log)))(cfg.output)
      if (!output.sessionStarted) void output.connect() // on-demand outputs connect per session
      this.#consoles.set(cfg.id, {
        cfg,
        output,
        selectedAt: undefined,
        sawInput: false,
        connected: false,
      })
    }
    this.#off = opts.hub.subscribe((tv) => {
      for (const c of this.#consoles.values())
        if (c.cfg.tvDeviceId === tv.id) {
          this.#follow(c, tv)
          this.#emit(c)
        }
    })
    // The output has no change event, so its connection state is polled.
    this.#poll = setInterval(() => {
      for (const c of this.#consoles.values())
        if (c.output.connected() !== c.connected) {
          c.connected = !c.connected
          this.#emit(c)
        }
    }, opts.pollMs ?? 1000)
    this.#poll.unref?.()
  }

  /** Forget the hub's input selection once the TV turns off or shows something else. */
  #follow(c: Console, tv: Device) {
    const power = capability(tv, 'power')?.state.power
    const app = capability(tv, 'appLauncher')?.state.currentApp
    const onInput = !!app?.known && app.value?.id === c.cfg.tvInputAppId
    if (c.selectedAt !== undefined && onInput) c.sawInput = true
    if (
      (power?.known && power.value !== 'on') ||
      (c.sawInput && app?.known && !onInput) // left the input after having shown it
    ) {
      c.selectedAt = undefined
      c.sawInput = false
    }
  }

  #lookingUp = false
  #device(c: Console): Device {
    // hub.devices() includes this adapter's own devices, so it calls back in here: answer the inner
    // call without the TV instead of recursing (the outer call gets the TV from the TV's adapter).
    let tv: Device | undefined
    if (!this.#lookingUp) {
      this.#lookingUp = true
      try {
        tv = this.#hub.devices().find((d) => d.id === c.cfg.tvDeviceId)
      } finally {
        this.#lookingUp = false
      }
    }
    return toDevice(c.cfg, tv, c.selectedAt, c.output.connected())
  }

  #emit(c: Console) {
    const d = this.#device(c)
    for (const l of this.#listeners) l(d)
  }

  devices(): Device[] {
    return [...this.#consoles.values()].map((c) => this.#device(c))
  }

  subscribe(listener: (d: Device) => void) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  gamepad(deviceId: string) {
    return this.#consoles.get(deviceId)?.output
  }

  /** Only power on is allowed: nothing the hub sends may power the console off mid-game. */
  danger(_device: Device, command: Command): Danger {
    return command.type === 'power' && command.on ? 'none' : 'blocked'
  }

  async health() {
    const down = [...this.#consoles.values()].filter((c) => !c.output.connected())
    return down.length
      ? { ok: false, detail: `Controller not connected: ${down.map((c) => c.cfg.id).join(', ')}` }
      : { ok: true }
  }

  async execute(deviceId: string, command: Command): Promise<CommandResult> {
    const t0 = performance.now()
    const ms = () => Math.round(performance.now() - t0)
    const c = this.#consoles.get(deviceId)
    if (!c) return { ok: false, reason: 'unsupported', detail: 'No such console', ms: ms() }
    if (this.danger(this.#device(c), command) === 'blocked')
      return { ok: false, reason: 'blocked', ms: ms() }
    const on = await this.#hub.execute(c.cfg.tvDeviceId, { type: 'power', op: 'set', on: true })
    if (!on.ok) return { ...on, ms: ms() }
    const input = await this.#hub.execute(c.cfg.tvDeviceId, {
      type: 'inputSource',
      op: 'select',
      inputId: c.cfg.tvInputId,
    })
    if (!input.ok)
      return {
        ok: false,
        reason: input.reason,
        detail: `The TV is on, but it did not switch to the console's input${input.detail ? `: ${input.detail}` : ''}`,
        ms: ms(),
      }
    c.selectedAt = Date.now()
    c.sawInput = false
    this.#emit(c)
    // The console cannot report: it wakes from its own controller or HDMI-CEC, if at all.
    return { ok: true, applied: 'assumed', ms: ms() }
  }

  async close() {
    clearInterval(this.#poll)
    this.#off()
    for (const c of this.#consoles.values()) {
      c.output.release()
      await c.output.close()
    }
  }
}
