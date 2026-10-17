// One interface for the web app, whether it runs on simulated devices (showcase, `pnpm dev:demo`)
// or against a real hub on the home network. API reference: docs/api.md.
import { DEMO_SCENES, DemoAdapter, type DemoOptions } from '@dr4w-home/adapter-demo'
import {
  type Command,
  type CommandResult,
  type ControllerProfile,
  type Device,
  type DeviceAdapter,
  runScene,
  type Scene,
} from '@dr4w-home/device-sdk'
import { extraDemoAdapters } from './demo-adapters.ts'
import { demoGamepad, type GamepadSession, hubGamepad, socketUrl, virtualPad } from './gamepad.ts'

export * from './gamepad.ts'

export type LinkStatus = 'live' | 'reconnecting' | 'down'
export type SceneResult = { ok: boolean; failedStep?: number }

export interface HomeSource {
  readonly kind: 'demo' | 'hub'
  load(): Promise<{ devices: Device[]; scenes: Scene[] }>
  subscribe(onDevice: (d: Device) => void, onStatus: (s: LinkStatus) => void): () => void
  execute(deviceId: string, command: Command, confirmed?: boolean): Promise<CommandResult>
  runScene(sceneId: string, onStep?: (step: number, of: number) => void): Promise<SceneResult>
  /** Live controller input for a device with a `gamepad` capability (docs/controller.md). */
  gamepad(deviceId: string): GamepadSession
  /** Saved controller layouts. The presets are not included: they ship with the app. */
  listProfiles(): Promise<ControllerProfile[]>
  saveProfile(profile: ControllerProfile): Promise<void>
  deleteProfile(id: string): Promise<void>
}

/** Only well-formed layouts get through; the schema loads with the first call, not with the app. */
async function validProfiles(raw: unknown): Promise<ControllerProfile[]> {
  const { ControllerProfileSchema } = await import('@dr4w-home/device-sdk/schema')
  if (!Array.isArray(raw)) return []
  return raw.flatMap((p) => {
    const r = ControllerProfileSchema.safeParse(p)
    return r.success ? [r.data] : []
  })
}

const PROFILES_KEY = 'dr4w-home:controller-profiles'

/** Demo layouts live in this browser only; private windows and blocked storage fall back to memory. */
function localProfiles(storage: () => Pick<Storage, 'getItem' | 'setItem'> | undefined) {
  let memory: ControllerProfile[] = []
  const read = async () => {
    try {
      const text = storage()?.getItem(PROFILES_KEY)
      if (text) memory = await validProfiles(JSON.parse(text))
    } catch {}
    return memory
  }
  const write = (all: ControllerProfile[]) => {
    memory = all
    try {
      storage()?.setItem(PROFILES_KEY, JSON.stringify(all))
    } catch {}
  }
  return {
    listProfiles: read,
    async saveProfile(p: ControllerProfile) {
      const all = await read()
      write(all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? p : x)) : [...all, p])
    },
    async deleteProfile(id: string) {
      write((await read()).filter((x) => x.id !== id))
    },
  }
}

const browserStorage = () => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** Everything in the browser: no network, nothing real controlled. */
export function demoSource(
  opts: DemoOptions & {
    extras?: boolean
    storage?: () => Pick<Storage, 'getItem' | 'setItem'> | undefined
  } = {},
): HomeSource & { adapter: DemoAdapter; devices(): Device[]; pad: ReturnType<typeof virtualPad> } {
  const adapter = new DemoAdapter(opts)
  // shortcut: one virtual console for every demo device; give each its own once the demo has two pads.
  const pad = virtualPad()
  const all: DeviceAdapter[] = [adapter, ...(opts.extras === false ? [] : extraDemoAdapters())]
  const owner = (id: string) => all.find((a) => a.devices().some((d) => d.id === id))
  const devices = () => all.flatMap((a) => a.devices())
  const execute = async (
    id: string,
    command: Command,
    confirmed?: boolean,
  ): Promise<CommandResult> =>
    (await owner(id)?.execute(id, command, { confirmed })) ?? {
      ok: false,
      reason: 'unsupported',
      detail: 'No such device',
      ms: 0,
    }
  return {
    kind: 'demo',
    adapter,
    devices,
    pad,
    gamepad: () => demoGamepad(pad),
    ...localProfiles(opts.storage ?? browserStorage),
    load: async () => ({ devices: devices(), scenes: DEMO_SCENES }),
    subscribe(onDevice, onStatus) {
      onStatus('live')
      const offs = all.map((a) => a.subscribe(onDevice))
      return () => {
        for (const off of offs) off()
      }
    },
    execute,
    async runScene(sceneId, onStep) {
      const scene = DEMO_SCENES.find((s) => s.id === sceneId)
      if (!scene) return { ok: false }
      let i = 0
      return runScene(scene, (id, c) => {
        onStep?.(++i, scene.steps.length)
        return execute(id, c)
      })
    },
  }
}

export class HubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** A real hub. Same origin by default; the session cookie comes from the hub's pairing link. */
export function hubSource(base = '', fetchImpl: typeof fetch = (...a) => fetch(...a)): HomeSource {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetchImpl(`${base}${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: { 'content-type': 'application/json', 'x-dr4w-client': '1', ...init?.headers },
    })
    if (!res.ok)
      throw new HubError(
        res.status,
        res.status === 403
          ? 'This phone is not signed in to the hub'
          : `Hub answered ${res.status}`,
      )
    const text = await res.text() // a DELETE may answer 204 with no body
    return (text ? JSON.parse(text) : undefined) as T
  }
  return {
    kind: 'hub',
    async load() {
      const [devices, scenes] = await Promise.all([
        call<Device[]>('/api/devices'),
        call<Scene[]>('/api/scenes'),
      ])
      return { devices, scenes }
    },
    subscribe(onDevice, onStatus) {
      const es = new EventSource(`${base}/api/events`, { withCredentials: true })
      es.addEventListener('device', (e) => onDevice(JSON.parse((e as MessageEvent).data) as Device))
      es.onopen = () => onStatus('live')
      es.onerror = () => onStatus(es.readyState === EventSource.CLOSED ? 'down' : 'reconnecting')
      return () => es.close()
    },
    execute: (id, command, confirmed) =>
      call<CommandResult>(`/api/devices/${encodeURIComponent(id)}/commands`, {
        method: 'POST',
        body: JSON.stringify({ command, confirmed }),
      }),
    // The hub runs scenes itself, so a scene finishes even if the phone locks halfway.
    runScene: (sceneId) =>
      call<SceneResult>(`/api/scenes/${encodeURIComponent(sceneId)}/run`, { method: 'POST' }),
    gamepad: (id) => hubGamepad(socketUrl(base, `/api/gamepad/${encodeURIComponent(id)}`)),
    listProfiles: async () => validProfiles(await call<unknown>('/api/controller-profiles')),
    async saveProfile(p) {
      await call(`/api/controller-profiles/${encodeURIComponent(p.id)}`, {
        method: 'PUT',
        body: JSON.stringify(p),
      })
    },
    async deleteProfile(id) {
      await call(`/api/controller-profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
  }
}
