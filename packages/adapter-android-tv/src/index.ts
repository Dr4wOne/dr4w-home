// Android TV and Google TV adapter, over Google's Android TV Remote v2 protocol (TLS on 6466,
// pairing on 6467). Tested on a Philips Android TV. Protocol notes: docs/protocol.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type AdapterManifest,
  type App,
  type Availability,
  type Capability,
  type Command,
  type CommandResult,
  type Danger,
  type Device,
  type DeviceAdapter,
  type KeyName,
  reported,
  type Value,
} from '@dr4w-home/device-sdk'
import { keyCode, loadIdentity, type TvState, wakeUntilReachable } from './protocol/index.ts'
import { type Log, type Remote, rediscoverTv, TvSession } from './session.ts'

export { askCode, pairTv } from './pair.ts'
export * from './protocol/index.ts'
export { type Remote, rediscoverTv, TvSession } from './session.ts'
export { FakeRemote } from './testing.ts'

export type TvDeviceConfig = {
  id: string
  name: string
  room?: string
  /** Directory with client-key.pem, client-cert.pem and tv.json (written by scripts/pair.ts). */
  stateDir: string
  host?: string
  mac?: string
}

/** Apps opened by https:// deep links; the TV routes each link to the installed app. */
/** `prefix` covers apps that ship under several package names (regional builds). */
export const APPS: (App & { link?: string; packages: string[]; prefix?: string })[] = [
  {
    id: 'home',
    name: 'Home',
    packages: ['com.google.android.apps.tv.launcherx', 'com.google.android.tvlauncher'],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    link: 'https://www.youtube.com',
    packages: ['com.google.android.youtube.tv'],
  },
  {
    id: 'netflix',
    name: 'Netflix',
    link: 'https://www.netflix.com/browse',
    packages: ['com.netflix.ninja'],
  },
  {
    id: 'disney',
    name: 'Disney+',
    link: 'https://www.disneyplus.com',
    packages: [],
    prefix: 'com.disney.',
  },
  {
    id: 'prime',
    name: 'Prime Video',
    link: 'https://app.primevideo.com',
    packages: ['com.amazon.amazonvideo.livingroom'],
  },
]

const KEYMAP: Record<KeyName, string> = {
  up: 'DPAD_UP',
  down: 'DPAD_DOWN',
  left: 'DPAD_LEFT',
  right: 'DPAD_RIGHT',
  select: 'DPAD_CENTER',
  back: 'BACK',
  home: 'HOME',
  menu: 'MENU',
  playPause: 'MEDIA_PLAY_PAUSE',
}

const READBACK_MS = 2500
const LOUD = 80

export const manifest: AdapterManifest = {
  id: 'android-tv',
  name: 'Android TV',
  worksWith: 'Works with Android TV and Google TV; tested on a Philips Android TV',
  categories: ['tv'],
  capabilities: ['power', 'volume', 'mute', 'keypad', 'appLauncher'],
}

export const appFor = (pkg: string | undefined): App | null => {
  if (!pkg) return null
  const a = APPS.find((x) => x.packages.includes(pkg) || (x.prefix && pkg.startsWith(x.prefix)))
  return a
    ? { id: a.id, name: a.name }
    : { id: pkg.replace(/[^a-z0-9-]/gi, '-').toLowerCase(), name: pkg }
}

/** The device as the hub sees it, from the session's current state. Pure, for tests. */
export function toDevice(
  cfg: TvDeviceConfig,
  state: TvState,
  availability: Availability,
  at: number,
): Device {
  const v = <T>(x: T | undefined): Value<T> =>
    x === undefined || !at ? { known: false } : reported(x, at)
  const online = availability.status === 'online'
  const caps: Capability[] = [
    {
      id: 'power',
      type: 'power',
      features: { wakeOnLan: !!cfg.mac },
      // Unreachable for a while means deep standby: off, but Wake-on-LAN can switch it on.
      state: {
        power: online
          ? v(state.power === undefined ? undefined : state.power ? 'on' : 'off')
          : { known: false },
      },
    },
    {
      id: 'volume',
      type: 'volume',
      features: { absolute: true, step: true, max: state.volume?.max ?? 100 },
      state: { level: online ? v(state.volume?.level) : { known: false } },
    },
    {
      id: 'mute',
      type: 'mute',
      features: {},
      state: { muted: online ? v(state.volume?.muted) : { known: false } },
    },
    {
      id: 'keypad',
      type: 'keypad',
      features: { keys: Object.keys(KEYMAP) as KeyName[] },
      state: {},
    },
    {
      id: 'apps',
      type: 'appLauncher',
      features: { catalog: APPS.map(({ id, name }) => ({ id, name })) },
      state: {
        currentApp: online && state.app ? reported(appFor(state.app), at) : { known: false },
      },
    },
    // shortcut: no inputSource. HDMI keys exist but the TV gives no read-back for them (tested
    // 2026-10-16), so a switch cannot be confirmed; add it once a confirmed signal is found.
  ]
  return {
    id: cfg.id,
    name: cfg.name,
    ...(cfg.room ? { room: cfg.room } : {}),
    category: 'tv',
    worksWith: manifest.worksWith,
    availability,
    capabilities: caps,
  }
}

type Tv = { cfg: TvDeviceConfig; session: TvSession; mac?: string }

export type AndroidTvOptions = {
  log?: Log
  /** Tests inject a fake connection and wake. */
  makeRemote?: (host: string) => Remote
  wake?: (host: string, mac: string) => Promise<unknown>
  readbackMs?: number
}

export class AndroidTvAdapter implements DeviceAdapter {
  readonly manifest = manifest
  #tvs = new Map<string, Tv>()
  #listeners = new Set<(d: Device) => void>()
  #opts: AndroidTvOptions

  constructor(opts: AndroidTvOptions = {}) {
    this.#opts = opts
  }

  /** Adds a paired TV and starts its session. */
  async add(cfg: TvDeviceConfig) {
    const tv = JSON.parse(readFileSync(join(cfg.stateDir, 'tv.json'), 'utf8')) as {
      host: string
      mac?: string
      serverCert: string
    }
    const mac = cfg.mac ?? tv.mac
    const session = new TvSession({
      host: cfg.host ?? tv.host,
      identity: await loadIdentity(cfg.stateDir),
      pinnedCert: tv.serverCert,
      rediscover: () => rediscoverTv(tv.serverCert, mac),
      // Remember the new address after a DHCP change, so the next start connects at once.
      onHostChange: (host) =>
        writeFileSync(
          join(cfg.stateDir, 'tv.json'),
          `${JSON.stringify({ ...tv, host }, null, 2)}\n`,
          {
            mode: 0o600,
          },
        ),
      ...(this.#opts.makeRemote ? { makeRemote: this.#opts.makeRemote } : {}),
      ...(this.#opts.log ? { log: this.#opts.log } : {}),
    })
    this.addSession(cfg, session, mac)
    session.start()
  }

  /** Adds a TV with a ready-made session (tests). */
  addSession(cfg: TvDeviceConfig, session: TvSession, mac?: string) {
    const entry: Tv = { cfg, session, ...(mac ? { mac } : {}) }
    this.#tvs.set(cfg.id, entry)
    session.on('change', () => {
      const d = this.#device(entry)
      for (const l of this.#listeners) l(d)
    })
  }

  #device({ cfg, session }: Tv): Device {
    const r = session.remote
    const status: Availability['status'] = session.fresh ? 'online' : r ? 'unknown' : 'offline'
    return toDevice(
      cfg,
      r?.state ?? {},
      { status, ...(r?.lastFrameAt ? { lastSeenAt: r.lastFrameAt } : {}) },
      r?.lastFrameAt ?? 0,
    )
  }

  devices(): Device[] {
    return [...this.#tvs.values()].map((t) => this.#device(t))
  }

  subscribe(listener: (d: Device) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async health() {
    const tvs = [...this.#tvs.values()]
    const stale = tvs.filter((t) => !t.session.fresh).map((t) => t.cfg.id)
    return stale.length
      ? { ok: false, detail: `No fresh session: ${stale.join(', ')}` }
      : { ok: true }
  }

  danger(_device: Device, command: Command): Danger {
    if (command.type === 'keypad') {
      try {
        keyCode(KEYMAP[command.key])
      } catch {
        return 'blocked'
      }
    }
    if (
      command.type === 'appLauncher' &&
      !APPS.some((a) => a.id === command.appId && (a.link || a.id === 'home'))
    )
      return 'blocked'
    if (
      command.type === 'inputSource' ||
      command.type === 'lightLevel' ||
      command.type === 'lightColor'
    )
      return 'blocked'
    if (command.type === 'volume' && command.op === 'set' && command.level > LOUD) return 'confirm'
    return 'none'
  }

  async execute(
    deviceId: string,
    command: Command,
    opts: { confirmed?: boolean } = {},
  ): Promise<CommandResult> {
    const t0 = performance.now()
    const done = (
      r:
        | { ok: true; applied: 'confirmed' }
        | { ok: false; reason: Exclude<CommandResult, { ok: true }>['reason']; detail?: string },
    ) => ({ ...r, ms: Math.round(performance.now() - t0) }) as CommandResult
    const tv = this.#tvs.get(deviceId)
    if (!tv) return done({ ok: false, reason: 'unsupported', detail: 'No such TV' })
    const danger = this.danger(this.#device(tv), command)
    if (danger === 'blocked') return done({ ok: false, reason: 'blocked' })
    if (danger === 'confirm' && !opts.confirmed)
      return done({ ok: false, reason: 'needsConfirmation' })
    try {
      await this.#run(tv, command)
      return done({ ok: true, applied: 'confirmed' })
    } catch (e) {
      const m = (e as Error).message
      const reason = /not reachable|not connected|wake/i.test(m)
        ? 'unreachable'
        : /is off/.test(m)
          ? 'invalidState'
          : 'timeout'
      return done({ ok: false, reason, detail: m })
    }
  }

  async #remote(tv: Tv): Promise<Remote> {
    // Always a fresh session before acting: cached state may be hours old (2026-10-16 incident).
    const r = await tv.session.ensure()
    if (!r) throw new Error('The TV is not reachable')
    return r
  }

  async #run(tv: Tv, c: Command): Promise<void> {
    const ms = this.#opts.readbackMs ?? READBACK_MS
    switch (c.type) {
      case 'power':
        return c.on ? this.#powerOn(tv) : this.#powerOff(tv)
      case 'volume': {
        const r = await this.#on(tv)
        if (c.op === 'step') {
          const before = r.state.volume?.level
          r.sendKey(c.direction === 'up' ? 'VOLUME_UP' : 'VOLUME_DOWN')
          await r.waitFor(
            (s) =>
              s.volume?.level !== before ||
              s.volume?.level === (c.direction === 'up' ? s.volume?.max : 0),
            ms,
          )
          return
        }
        return this.#volume(r, Math.min(c.level, r.state.volume?.max ?? 100), ms)
      }
      case 'mute': {
        const r = await this.#on(tv)
        if (r.state.volume?.muted === c.muted) return
        r.sendKey('VOLUME_MUTE')
        await r.waitFor((s) => s.volume?.muted === c.muted, ms)
        return
      }
      case 'keypad': {
        const r = await this.#on(tv)
        r.sendKey(KEYMAP[c.key])
        if (c.key === 'home')
          await r.waitFor((s) => APPS[0]?.packages.includes(s.app ?? '') ?? false, ms)
        return
      }
      case 'appLauncher': {
        await this.#powerOn(tv)
        const r = await this.#remote(tv)
        const app = APPS.find((a) => a.id === c.appId)
        if (!app) throw new Error('Unknown app')
        if (app.link) r.launchAppLink(app.link)
        else r.sendKey('HOME')
        await r.waitFor((s) => appFor(s.app)?.id === app.id, 8000)
        return
      }
      default:
        throw new Error('Not supported by this TV')
    }
  }

  async #on(tv: Tv): Promise<Remote> {
    const r = await this.#remote(tv)
    if (r.state.power === false) throw new Error(`${tv.cfg.name} is off`)
    return r
  }

  async #powerOn(tv: Tv) {
    let r = await tv.session.ensure()
    if (r?.state.power) return
    if (!r) {
      // Deep standby: the TV is off the network until it gets a Wake-on-LAN packet.
      if (!tv.mac)
        throw new Error('The TV is not reachable and its MAC address is unknown for Wake-on-LAN')
      const wake =
        this.#opts.wake ?? ((host: string, mac: string) => wakeUntilReachable({ host, mac }))
      await wake(tv.session.host, tv.mac)
      r = await this.#remote(tv)
    }
    if (!r.state.power) {
      try {
        await r.waitFor((s) => s.power === true, 2000) // Wake-on-LAN switches it on by itself
      } catch {
        r.sendKey('POWER')
        await r.waitFor((s) => s.power === true, 6000)
      }
    }
  }

  async #powerOff(tv: Tv) {
    const r = await tv.session.ensure()
    if (!r || r.state.power === false) return // already off, or in deep standby
    r.sendKey('POWER')
    await r.waitFor((s) => s.power === false, 6000)
  }

  async #volume(r: Remote, level: number, ms: number) {
    if (r.state.volume?.muted) {
      r.sendKey('VOLUME_MUTE')
      await r.waitFor((s) => s.volume?.muted === false, ms)
    }
    for (let i = 0; i < 101; i++) {
      const now = r.state.volume?.level
      if (now === undefined) throw new Error('The TV has not reported its volume')
      if (now === level) return
      r.sendKey(now < level ? 'VOLUME_UP' : 'VOLUME_DOWN')
      await r.waitFor((s) => s.volume?.level !== now, ms)
    }
    throw new Error('Volume did not reach the target')
  }

  async close() {
    for (const t of this.#tvs.values()) t.session.stop()
  }
}
