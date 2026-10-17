// Simulated living room: a TV, two consoles and a lamp. Runs in the browser (the showcase) and in
// tests. Timings come from sessions recorded with a real Android TV (fixtures/timings.json); the
// consoles and the lamp follow what their real control paths would report.
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
  reported,
  type Scene,
  unknown,
} from '@dr4w-home/device-sdk'
import timings from '../fixtures/timings.json' with { type: 'json' }

type WithoutMs<T> = T extends unknown ? Omit<T, 'ms'> : never

export type DemoOptions = {
  /** Scales every delay; 0 makes tests instant. */
  speed?: number
  /** Probability that a command is lost (the device never confirms), for showing rollback. */
  dropRate?: number
  random?: () => number
}

const APPS = [
  { id: 'home', name: 'Home' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'netflix', name: 'Netflix' },
  { id: 'disney', name: 'Disney+' },
  { id: 'prime', name: 'Prime Video' },
]
const INPUTS = [
  { id: 'tv', name: 'TV apps', kind: 'internal' as const },
  { id: 'hdmi1', name: 'HDMI 1 · Switch', kind: 'hdmi' as const },
  { id: 'hdmi2', name: 'HDMI 2 · Switch 2', kind: 'hdmi' as const },
]

function livingRoom(): Device[] {
  const t = 0
  return [
    {
      id: 'tv',
      name: 'Living room TV',
      room: 'Living room',
      category: 'tv',
      worksWith: 'Works with Android TV and Google TV',
      availability: { status: 'online', lastSeenAt: t },
      capabilities: [
        {
          id: 'power',
          type: 'power',
          features: { wakeOnLan: true },
          state: { power: reported('off', t) },
        },
        {
          id: 'volume',
          type: 'volume',
          features: { absolute: true, step: true, max: 100 },
          state: { level: reported(18, t) },
        },
        { id: 'mute', type: 'mute', features: {}, state: { muted: reported(false, t) } },
        {
          id: 'keypad',
          type: 'keypad',
          features: {
            keys: ['up', 'down', 'left', 'right', 'select', 'back', 'home', 'playPause'],
          },
          state: {},
        },
        {
          id: 'apps',
          type: 'appLauncher',
          features: { catalog: APPS },
          state: { currentApp: reported(APPS[0] ?? null, t) },
        },
        {
          id: 'input',
          type: 'inputSource',
          features: { inputs: INPUTS },
          state: { currentInput: reported('tv', t) },
        },
      ],
    },
    consoleDevice('switch', 'Switch', 'Works with Nintendo Switch'),
    consoleDevice('switch2', 'Switch 2', 'Works with Nintendo Switch 2'),
    {
      id: 'lamp',
      name: 'Floor lamp',
      room: 'Living room',
      category: 'light',
      worksWith: 'Simulated lamp',
      availability: { status: 'online', lastSeenAt: t },
      capabilities: [
        { id: 'power', type: 'power', features: {}, state: { power: reported('on', t) } },
        {
          id: 'level',
          type: 'lightLevel',
          features: { min: 1, max: 100 },
          state: { level: reported(60, t) },
        },
        {
          id: 'color',
          type: 'lightColor',
          features: { ctMinK: 2200, ctMaxK: 6500 },
          state: { kelvin: reported(2700, t) },
        },
      ],
    },
  ]
}

function consoleDevice(id: string, name: string, worksWith: string): Device {
  return {
    id,
    name,
    room: 'Living room',
    category: 'console',
    worksWith,
    availability: { status: 'online', lastSeenAt: 0 },
    capabilities: [
      // Consoles are powered over HDMI-CEC by the TV and do not report back, so state stays assumed.
      {
        id: 'power',
        type: 'power',
        features: {},
        state: { power: assumed('off', 0) },
        via: { deviceId: 'tv', capabilityId: 'power' },
      },
      {
        id: 'activity',
        type: 'activity',
        features: {},
        state: { activity: unknown, title: unknown },
      },
      // The phone controller (docs/controller.md): in demo mode it drives an in-memory console.
      {
        id: 'gamepad',
        type: 'gamepad',
        label: 'Controller',
        features: { layout: 'switch-pro', buttons: [...GAMEPAD_BUTTONS] },
        state: { connected: reported(true, 0) },
      },
    ],
  }
}

/** The TV input each console is plugged into. */
const CONSOLE_INPUT: Record<string, string> = { switch: 'hdmi1', switch2: 'hdmi2' }

export const manifest: AdapterManifest = {
  id: 'demo',
  name: 'Demo living room',
  worksWith: 'Simulated devices, no hardware needed',
  categories: ['tv', 'console', 'light'],
  capabilities: [
    'power',
    'volume',
    'mute',
    'keypad',
    'appLauncher',
    'inputSource',
    'activity',
    'lightLevel',
    'lightColor',
    'gamepad',
  ],
}

export class DemoAdapter implements DeviceAdapter {
  readonly manifest = manifest
  private readonly state = new Map<string, Device>()
  private readonly listeners = new Set<(d: Device) => void>()
  private readonly speed: number
  private readonly dropRate: number
  private readonly random: () => number
  private forceFail = false

  constructor(opts: DemoOptions = {}) {
    this.speed = opts.speed ?? 1
    this.dropRate = opts.dropRate ?? 0
    this.random = opts.random ?? Math.random
    for (const d of livingRoom()) this.state.set(d.id, d)
  }

  devices(): Device[] {
    return [...this.state.values()]
  }

  subscribe(listener: (d: Device) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async health() {
    return { ok: true }
  }

  danger(device: Device, command: Command): Danger {
    // A console that is playing would lose unsaved progress.
    const playing = capability(device, 'activity')?.state.activity
    if (command.type === 'power' && !command.on && playing?.known && playing.value === 'playing')
      return 'confirm'
    if (command.type === 'volume' && command.op === 'set' && command.level > 80) return 'confirm'
    return 'none'
  }

  /** The next command is lost (the device never confirms), to show rollback on purpose. */
  failNext() {
    this.forceFail = true
  }

  /** Simulate the device going away (showcase: "pull the plug"). */
  setOnline(deviceId: string, online: boolean) {
    this.update(deviceId, (d) => {
      d.availability = { status: online ? 'online' : 'offline', lastSeenAt: Date.now() }
    })
  }

  async execute(
    deviceId: string,
    command: Command,
    opts: { confirmed?: boolean } = {},
  ): Promise<CommandResult> {
    const started = performance.now()
    const done = (r: WithoutMs<CommandResult>) =>
      ({ ...r, ms: Math.round(performance.now() - started) }) as CommandResult
    const device = this.state.get(deviceId)
    if (!device) return done({ ok: false, reason: 'unsupported', detail: 'No such device' })
    const danger = this.danger(device, command)
    if (danger === 'blocked') return done({ ok: false, reason: 'blocked' })
    if (danger === 'confirm' && !opts.confirmed)
      return done({ ok: false, reason: 'needsConfirmation' })
    if (device.availability.status === 'offline') return done({ ok: false, reason: 'unreachable' })
    if (!device.capabilities.some((c) => c.type === command.type))
      return done({ ok: false, reason: 'unsupported' })

    const power = capability(device, 'power')?.state.power
    const isOn = power?.known && power.value === 'on'
    if (command.type !== 'power' && device.category !== 'light' && !isOn)
      return done({ ok: false, reason: 'invalidState', detail: `${device.name} is off` })

    await this.wait(this.delay(device, command))
    if (this.forceFail || this.random() < this.dropRate) {
      this.forceFail = false
      return done({ ok: false, reason: 'timeout', detail: 'The device did not confirm' })
    }

    if (device.category === 'console' && command.type === 'power') {
      // Delegated to the TV over HDMI-CEC: the TV switches input when the console wakes.
      this.update(deviceId, (d) => {
        set(d, 'power', { power: assumed(command.on ? 'on' : 'off') })
        set(d, 'activity', {
          activity: command.on ? assumed('menu') : unknown,
          title: command.on ? assumed('Home menu') : unknown,
        })
      })
      if (command.on) {
        const input = CONSOLE_INPUT[deviceId] ?? 'hdmi1'
        this.update('tv', (d) => {
          set(d, 'power', { power: reported('on') })
          set(d, 'inputSource', { currentInput: reported(input) })
          set(d, 'appLauncher', { currentApp: reported(null) })
        })
      }
      return done({ ok: true, applied: 'assumed' })
    }

    this.update(deviceId, (d) => apply(d, command))
    return done({ ok: true, applied: 'confirmed' })
  }

  private delay(device: Device, command: Command): number {
    const jitter = () => this.random() * timings.jitterMs
    const base =
      command.type === 'power'
        ? device.category === 'tv'
          ? command.on
            ? timings.powerOnMs
            : timings.powerOffMs
          : device.category === 'console'
            ? timings.cecMs
            : timings.lightMs
        : command.type === 'appLauncher'
          ? timings.appLaunchMs
          : device.category === 'light'
            ? timings.lightMs
            : timings.keyMs
    return (base + jitter()) * this.speed
  }

  private wait(ms: number) {
    return ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve()
  }

  private update(deviceId: string, fn: (d: Device) => void) {
    const current = this.state.get(deviceId)
    if (!current) return
    const next = structuredClone(current)
    fn(next)
    next.availability.lastSeenAt = Date.now()
    this.state.set(deviceId, next)
    for (const l of this.listeners) l(next)
  }
}

function set<T extends Capability['type']>(
  d: Device,
  type: T,
  state: Extract<Capability, { type: T }>['state'],
) {
  const cap = d.capabilities.find((c) => c.type === type)
  if (cap) cap.state = state as never
}

function apply(d: Device, c: Command) {
  switch (c.type) {
    case 'power':
      set(d, 'power', { power: reported(c.on ? 'on' : 'off') })
      return
    case 'volume': {
      const v = capability(d, 'volume')
      const cur = v?.state.level.known ? v.state.level.value : 0
      const level = c.op === 'set' ? c.level : cur + (c.direction === 'up' ? 1 : -1)
      set(d, 'volume', { level: reported(Math.max(0, Math.min(v?.features.max ?? 100, level))) })
      set(d, 'mute', { muted: reported(false) })
      return
    }
    case 'mute':
      set(d, 'mute', { muted: reported(c.muted) })
      return
    case 'keypad':
      if (c.key === 'home') {
        set(d, 'appLauncher', { currentApp: reported(APPS[0] ?? null) })
        set(d, 'inputSource', { currentInput: reported('tv') })
      }
      return
    case 'appLauncher': {
      const app = APPS.find((a) => a.id === c.appId) ?? null
      set(d, 'appLauncher', { currentApp: reported(app) })
      set(d, 'inputSource', { currentInput: reported('tv') })
      return
    }
    case 'inputSource':
      set(d, 'inputSource', { currentInput: reported(c.inputId) })
      if (c.inputId !== 'tv') set(d, 'appLauncher', { currentApp: reported(null) })
      return
    case 'lightLevel':
      set(d, 'lightLevel', { level: reported(Math.max(1, Math.min(100, Math.round(c.level)))) })
      set(d, 'power', { power: reported('on') })
      return
    case 'lightColor':
      set(d, 'lightColor', { kelvin: reported(c.kelvin) })
      return
  }
}

export const DEMO_SCENES: Scene[] = [
  {
    id: 'movie-night',
    name: 'Movie night',
    synonyms: ['film', 'watch a movie', 'cinema'],
    steps: [
      { deviceId: 'tv', command: { type: 'power', op: 'set', on: true } },
      { deviceId: 'tv', command: { type: 'appLauncher', op: 'launch', appId: 'netflix' } },
      { deviceId: 'tv', command: { type: 'volume', op: 'set', level: 18 } },
      { deviceId: 'lamp', command: { type: 'lightLevel', op: 'set', level: 15 } },
      { deviceId: 'lamp', command: { type: 'lightColor', op: 'set', kelvin: 2200 } },
    ],
  },
  {
    id: 'play-mario-kart',
    name: 'Play Mario Kart',
    synonyms: ['mario kart', 'race', 'play switch 2'],
    steps: [
      { deviceId: 'switch2', command: { type: 'power', op: 'set', on: true } },
      { deviceId: 'tv', command: { type: 'volume', op: 'set', level: 24 } },
      { deviceId: 'lamp', command: { type: 'lightLevel', op: 'set', level: 45 } },
    ],
  },
  {
    id: 'quiet',
    name: 'Quiet',
    synonyms: ['shh', 'keep it down', 'baby is asleep'],
    steps: [{ deviceId: 'tv', command: { type: 'volume', op: 'set', level: 8 } }],
  },
  {
    id: 'goodnight',
    name: 'Goodnight',
    synonyms: ['all off', 'bedtime', 'everything off'],
    steps: [
      { deviceId: 'tv', command: { type: 'power', op: 'set', on: false } },
      { deviceId: 'lamp', command: { type: 'power', op: 'set', on: false } },
    ],
  },
]
