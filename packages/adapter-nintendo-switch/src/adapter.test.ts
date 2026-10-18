import {
  type Command,
  type CommandResult,
  capability,
  type Device,
  reported,
} from '@dr4w-home/device-sdk'
import { afterEach, expect, it } from 'vitest'
import { type Hub, NintendoSwitchAdapter, type SwitchDeviceConfig } from './index.ts'
import { DemoOutput } from './outputs.ts'

const cfg: SwitchDeviceConfig = {
  id: 'switch2',
  name: 'Switch 2',
  tvDeviceId: 'tv',
  tvInputId: 'hdmi2',
  tvInputAppId: 'tv-input',
  output: { kind: 'demo' },
}

function tv(power: 'on' | 'off', app = 'youtube'): Device {
  return {
    id: 'tv',
    name: 'TV',
    category: 'tv',
    worksWith: 'test',
    availability: { status: 'online' },
    capabilities: [
      { id: 'power', type: 'power', features: {}, state: { power: reported(power) } },
      {
        id: 'apps',
        type: 'appLauncher',
        features: { catalog: [] },
        state: { currentApp: reported({ id: app, name: app }) },
      },
    ],
  }
}

function fakeHub(
  result: (c: Command) => CommandResult = () => ({ ok: true, applied: 'confirmed', ms: 1 }),
) {
  let current = tv('off')
  const listeners = new Set<(d: Device) => void>()
  const sent: Command[] = []
  const hub: Hub = {
    devices: () => [current],
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    execute: async (_id, c) => {
      sent.push(c)
      return result(c)
    },
  }
  const setTv = (d: Device) => {
    current = d
    for (const l of listeners) l(d)
  }
  return { hub, sent, setTv }
}

let adapters: NintendoSwitchAdapter[] = []
const make = (h: ReturnType<typeof fakeHub>, output = new DemoOutput()) => {
  const a = new NintendoSwitchAdapter([cfg], { hub: h.hub, makeOutput: () => output })
  adapters.push(a)
  return a
}
afterEach(async () => {
  for (const a of adapters) await a.close()
  adapters = []
})
const dev = (a: NintendoSwitchAdapter) => a.devices()[0] as Device

it('powers on as "TV on, then the console input", and the state stays assumed', async () => {
  const h = fakeHub()
  const a = make(h)
  expect(await a.execute('switch2', { type: 'power', op: 'set', on: true })).toMatchObject({
    ok: true,
    applied: 'assumed',
  })
  expect(h.sent).toEqual([
    { type: 'power', op: 'set', on: true },
    { type: 'inputSource', op: 'select', inputId: 'hdmi2' },
  ])
  const power = capability(dev(a), 'power')
  expect(power?.via).toEqual({ deviceId: 'tv', capabilityId: 'power' })
})

it('never powers the console off and refuses every other command', async () => {
  const h = fakeHub()
  const a = make(h)
  expect(await a.execute('switch2', { type: 'power', op: 'set', on: false })).toMatchObject({
    ok: false,
    reason: 'blocked',
  })
  expect(a.danger(dev(a), { type: 'volume', op: 'set', level: 5 })).toBe('blocked')
  expect(h.sent).toEqual([])
})

it('says so when the TV turns on but cannot select the input', async () => {
  const h = fakeHub((c) =>
    c.type === 'inputSource'
      ? { ok: false, reason: 'blocked', ms: 0 }
      : { ok: true, applied: 'confirmed', ms: 1 },
  )
  const r = await make(h).execute('switch2', { type: 'power', op: 'set', on: true })
  expect(r).toMatchObject({ ok: false, reason: 'blocked' })
  expect(r.ok === false && r.detail).toMatch(/TV is on/)
})

it('is "on screen" only when the hub selected the input and the TV shows its input app', async () => {
  const h = fakeHub()
  const a = make(h)
  const activity = () => capability(dev(a), 'activity')?.state
  h.setTv(tv('on', 'tv-input'))
  expect(activity()?.activity.known).toBe(false) // the hub did not select the input
  await a.execute('switch2', { type: 'power', op: 'set', on: true })
  h.setTv(tv('on', 'tv-input'))
  expect(activity()).toMatchObject({
    activity: { value: 'playing', source: 'assumed' },
    title: { value: 'On screen' },
  })
  expect(capability(dev(a), 'power')?.state.power).toMatchObject({ value: 'on', source: 'assumed' })
  h.setTv(tv('on', 'youtube')) // the person opened an app on the TV
  expect(activity()?.activity.known).toBe(false)
  h.setTv(tv('off'))
  expect(capability(dev(a), 'power')?.state.power).toMatchObject({
    value: 'off',
    source: 'assumed',
  })
})

it('reports the controller connection from the output', async () => {
  const out = new DemoOutput()
  const a = make(fakeHub(), out)
  await Promise.resolve()
  expect(a.gamepad('switch2')).toBe(out)
  const pad = capability(dev(a), 'gamepad')
  expect(pad?.features.layout).toBe('switch-pro')
  expect(pad?.state.connected).toMatchObject({ value: true })
  await out.close()
  expect(capability(dev(a), 'gamepad')?.state.connected).toMatchObject({ value: false })
  expect(dev(a).availability.status).toBe('unknown')
})

it('finds its TV through a hub that also lists the console itself (as main.ts wires it)', () => {
  const adapters: { devices(): Device[] }[] = [{ devices: () => [tv('on')] }]
  const hub: Hub = {
    devices: () => adapters.flatMap((a) => a.devices()),
    subscribe: () => () => {},
    execute: async () => ({ ok: true, applied: 'confirmed', ms: 0 }),
  }
  const sw = new NintendoSwitchAdapter([cfg], {
    hub,
    log: () => {},
    makeOutput: () => new DemoOutput(),
  })
  adapters.push(sw)
  expect(hub.devices().map((d) => d.id)).toEqual(['tv', 'switch2'])
  expect(capability(sw.devices()[0] as Device, 'power')?.via?.deviceId).toBe('tv')
  void sw.close?.()
})
