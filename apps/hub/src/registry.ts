// Every adapter's devices in one place: routes commands, enforces each adapter's danger rules
// (blocked commands are never sent; "confirm" needs confirmed: true) and runs scenes.
import {
  type Command,
  type CommandResult,
  type Device,
  type DeviceAdapter,
  runScene,
  type Scene,
} from '@dr4w-home/device-sdk'
import { log } from './log.ts'

export class Registry {
  readonly adapters: DeviceAdapter[]
  readonly scenes: Scene[]
  #listeners = new Set<(d: Device) => void>()

  constructor(adapters: DeviceAdapter[], scenes: Scene[]) {
    this.adapters = adapters
    this.scenes = scenes
    for (const a of adapters)
      a.subscribe((d) => {
        for (const l of this.#listeners) l(d)
      })
  }

  devices(): Device[] {
    return this.adapters.flatMap((a) => a.devices())
  }

  #find(id: string): { adapter: DeviceAdapter; device: Device } | undefined {
    for (const adapter of this.adapters) {
      const device = adapter.devices().find((d) => d.id === id)
      if (device) return { adapter, device }
    }
    return undefined
  }

  subscribe(listener: (d: Device) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async execute(deviceId: string, command: Command, confirmed = false): Promise<CommandResult> {
    const found = this.#find(deviceId)
    if (!found) return { ok: false, reason: 'unsupported', detail: 'No such device', ms: 0 }
    const danger = found.adapter.danger(found.device, command)
    if (danger === 'blocked') return { ok: false, reason: 'blocked', ms: 0 }
    if (danger === 'confirm' && !confirmed) return { ok: false, reason: 'needsConfirmation', ms: 0 }
    const r = await found.adapter.execute(deviceId, command, { confirmed: danger === 'confirm' })
    log(r.ok ? 'info' : 'error', 'command', {
      deviceId,
      type: command.type,
      ok: r.ok,
      ms: r.ms,
      ...(r.ok ? {} : { reason: r.reason }),
    })
    return r
  }

  /** Scenes are the owner's own config, so their "confirm" steps count as confirmed; blocked stays blocked. */
  async runScene(id: string): Promise<{ ok: boolean; failedStep?: number } | undefined> {
    const scene = this.scenes.find((s) => s.id === id)
    if (!scene) return undefined
    const r = await runScene(scene, (deviceId, command) => this.execute(deviceId, command, true))
    log(r.ok ? 'info' : 'error', 'scene', {
      id,
      ok: r.ok,
      ...(r.failedStep === undefined ? {} : { failedStep: r.failedStep }),
    })
    return r.failedStep === undefined ? { ok: r.ok } : { ok: r.ok, failedStep: r.failedStep }
  }

  async close() {
    for (const a of this.adapters) await a.close?.()
  }
}
