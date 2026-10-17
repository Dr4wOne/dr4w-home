import { capability, runScene, summary } from '@dr4w-home/device-sdk'
import { expect, it } from 'vitest'
import { DEMO_SCENES, DemoAdapter } from './index.ts'

const demo = () => new DemoAdapter({ speed: 0, random: () => 0.5 })
const tv = (a: DemoAdapter) => a.devices().find((d) => d.id === 'tv')!

it('refuses commands to a TV that is off, then confirms them once it is on', async () => {
  const a = demo()
  expect(await a.execute('tv', { type: 'volume', op: 'step', direction: 'up' })).toMatchObject({
    ok: false,
    reason: 'invalidState',
  })
  expect(await a.execute('tv', { type: 'power', op: 'set', on: true })).toMatchObject({
    ok: true,
    applied: 'confirmed',
  })
  await a.execute('tv', { type: 'volume', op: 'step', direction: 'up' })
  expect(summary(tv(a))).toBe('On · Home · Volume 19')
})

it('runs movie night and reports every device it touched', async () => {
  const a = demo()
  const seen = new Set<string>()
  a.subscribe((d) => seen.add(d.id))
  const scene = DEMO_SCENES.find((s) => s.id === 'movie-night')!
  const r = await runScene(
    scene,
    (id, c) => a.execute(id, c),
    async () => {},
  )
  expect(r.ok).toBe(true)
  expect(summary(tv(a))).toBe('On · Netflix · Volume 18')
  expect([...seen].sort()).toEqual(['lamp', 'tv'])
})

it('wakes a console through the TV and keeps its state assumed', async () => {
  const a = demo()
  expect(await a.execute('switch2', { type: 'power', op: 'set', on: true })).toMatchObject({
    ok: true,
    applied: 'assumed',
  })
  expect(capability(tv(a), 'inputSource')?.state.currentInput).toMatchObject({
    value: 'hdmi2',
    source: 'reported',
  })
  const sw = a.devices().find((d) => d.id === 'switch2')!
  expect(capability(sw, 'power')?.state.power).toMatchObject({ value: 'on', source: 'assumed' })
})

it('asks before a loud volume and fails cleanly when offline or when a command is lost', async () => {
  const a = demo()
  await a.execute('tv', { type: 'power', op: 'set', on: true })
  expect(await a.execute('tv', { type: 'volume', op: 'set', level: 95 })).toMatchObject({
    reason: 'needsConfirmation',
  })
  expect(
    await a.execute('tv', { type: 'volume', op: 'set', level: 95 }, { confirmed: true }),
  ).toMatchObject({ ok: true })
  a.setOnline('lamp', false)
  expect(await a.execute('lamp', { type: 'lightLevel', op: 'set', level: 10 })).toMatchObject({
    reason: 'unreachable',
  })
  const lossy = new DemoAdapter({ speed: 0, dropRate: 1 })
  expect(await lossy.execute('lamp', { type: 'lightLevel', op: 'set', level: 10 })).toMatchObject({
    reason: 'timeout',
  })
  expect(
    capability(lossy.devices().find((d) => d.id === 'lamp')!, 'lightLevel')?.state.level,
  ).toMatchObject({ value: 60 })
})

it('loses exactly the next command when asked, for showing rollback', async () => {
  const a = demo()
  a.failNext()
  expect(await a.execute('lamp', { type: 'lightLevel', op: 'set', level: 10 })).toMatchObject({
    reason: 'timeout',
  })
  expect(await a.execute('lamp', { type: 'lightLevel', op: 'set', level: 10 })).toMatchObject({
    ok: true,
  })
})
