import { expect, it } from 'vitest'
import { type CommandResult, runScene, type Scene } from './index.ts'

it('runs scene steps in order and stops at the first failure', async () => {
  const scene: Scene = {
    id: 's',
    name: 'S',
    steps: [
      { deviceId: 'a', command: { type: 'power', op: 'set', on: true }, settleMs: 5 },
      { deviceId: 'b', command: { type: 'power', op: 'set', on: true } },
      { deviceId: 'c', command: { type: 'power', op: 'set', on: true } },
    ],
  }
  const calls: string[] = []
  const waits: number[] = []
  const r = await runScene(
    scene,
    async (id): Promise<CommandResult> => {
      calls.push(id)
      return id === 'b'
        ? { ok: false, reason: 'unreachable', ms: 1 }
        : { ok: true, applied: 'confirmed', ms: 1 }
    },
    async (ms) => {
      waits.push(ms)
    },
  )
  expect(r).toMatchObject({ ok: false, failedStep: 1 })
  expect(calls).toEqual(['a', 'b'])
  expect(waits).toEqual([5])
})

it('predicts the state a command should produce, marked assumed', async () => {
  const { predict, reported, summary } = await import('./index.ts')
  const tv: import('./index.ts').Device = {
    id: 'tv',
    name: 'TV',
    category: 'tv' as const,
    worksWith: '',
    availability: { status: 'online' as const },
    capabilities: [
      {
        id: 'p',
        type: 'power' as const,
        features: {},
        state: { power: reported<'on' | 'off' | 'standby'>('on') },
      },
      {
        id: 'v',
        type: 'volume' as const,
        features: { absolute: true, step: true, max: 100 },
        state: { level: reported(100) },
      },
    ],
  }
  const next = predict(tv, { type: 'volume', op: 'step', direction: 'up' })
  expect(next.capabilities[1]?.state).toMatchObject({ level: { value: 100, source: 'assumed' } })
  expect(summary(predict(tv, { type: 'power', op: 'set', on: false }))).toBe('Off')
  expect(tv.capabilities[1]?.state).toMatchObject({ level: { source: 'reported' } })
})

it('predicts and summarises a mode such as fan speed', async () => {
  const { predict, reported, summary } = await import('./index.ts')
  const fan: import('./index.ts').Device = {
    id: 'fan',
    name: 'Fan',
    category: 'fan',
    worksWith: '',
    availability: { status: 'online' },
    capabilities: [
      {
        id: 'p',
        type: 'power',
        features: {},
        state: { power: reported<'on' | 'off' | 'standby'>('on') },
      },
      {
        id: 'speed',
        type: 'mode',
        label: 'Speed',
        features: {
          options: [
            { id: 'low', name: 'Low' },
            { id: 'high', name: 'High' },
          ],
        },
        state: { mode: reported('low') },
      },
    ],
  }
  expect(summary(fan)).toBe('On · Low')
  expect(summary(predict(fan, { type: 'mode', op: 'set', modeId: 'high' }))).toBe('On · High')
})
