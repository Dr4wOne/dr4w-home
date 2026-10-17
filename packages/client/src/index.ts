// One interface for the web app, whether it runs on simulated devices (showcase, `pnpm dev:demo`)
// or against a real hub on the home network. API reference: docs/api.md.
import { DEMO_SCENES, DemoAdapter, type DemoOptions } from '@dr4w-home/adapter-demo'
import {
  type Command,
  type CommandResult,
  type Device,
  type DeviceAdapter,
  runScene,
  type Scene,
} from '@dr4w-home/device-sdk'
import { extraDemoAdapters } from './demo-adapters.ts'

export type LinkStatus = 'live' | 'reconnecting' | 'down'
export type SceneResult = { ok: boolean; failedStep?: number }

export interface HomeSource {
  readonly kind: 'demo' | 'hub'
  load(): Promise<{ devices: Device[]; scenes: Scene[] }>
  subscribe(onDevice: (d: Device) => void, onStatus: (s: LinkStatus) => void): () => void
  execute(deviceId: string, command: Command, confirmed?: boolean): Promise<CommandResult>
  runScene(sceneId: string, onStep?: (step: number, of: number) => void): Promise<SceneResult>
}

/** Everything in the browser: no network, nothing real controlled. */
export function demoSource(
  opts: DemoOptions & { extras?: boolean } = {},
): HomeSource & { adapter: DemoAdapter; devices(): Device[] } {
  const adapter = new DemoAdapter(opts)
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
    return (await res.json()) as T
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
  }
}
