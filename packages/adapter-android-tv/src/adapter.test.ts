import { capability, summary } from '@dr4w-home/device-sdk'
import { expect, it } from 'vitest'
import { AndroidTvAdapter, appFor } from './index.ts'
import { createIdentity } from './protocol/index.ts'
import { TvSession } from './session.ts'
import { FakeRemote } from './testing.ts'

const cfg = { id: 'tv', name: 'Living room TV', stateDir: '/nonexistent' }

async function setup(
  remotes: FakeRemote[],
  opts: { mac?: string; wake?: () => Promise<unknown> } = {},
) {
  const queue = [...remotes]
  const made: FakeRemote[] = []
  const id = await createIdentity('t')
  const session = new TvSession({
    host: '192.0.2.10',
    identity: id,
    pinnedCert: id.cert,
    freshMs: 200,
    makeRemote: () => {
      const r = queue.shift() ?? new FakeRemote()
      made.push(r)
      return r
    },
  })
  const tv = new AndroidTvAdapter({ readbackMs: 300, ...(opts.wake ? { wake: opts.wake } : {}) })
  tv.addSession(cfg, session, opts.mac)
  session.start()
  await new Promise((r) => setTimeout(r, 10))
  return { tv, session, made }
}

it('reports the TV with confirmed state and an app name for its package', async () => {
  const { tv, session } = await setup([
    new FakeRemote({
      app: 'com.google.android.youtube.tv',
      volume: { level: 14, max: 100, muted: false },
    }),
  ])
  const [d] = tv.devices()
  expect(summary(d!)).toBe('On · YouTube · Volume 14')
  expect(capability(d!, 'volume')?.state.level).toMatchObject({ source: 'reported' })
  expect(appFor('org.example.player')).toEqual({
    id: 'org-example-player',
    name: 'org.example.player',
  })
  session.stop()
})

it('sets the volume by stepping with read-back, and asks before a loud level', async () => {
  const { tv, made, session } = await setup([new FakeRemote()])
  expect(await tv.execute('tv', { type: 'volume', op: 'set', level: 21 })).toMatchObject({
    ok: true,
    applied: 'confirmed',
  })
  expect(made[0]?.state.volume?.level).toBe(21)
  expect(made[0]?.sent).toEqual(['VOLUME_UP', 'VOLUME_UP', 'VOLUME_UP'])
  expect(await tv.execute('tv', { type: 'volume', op: 'set', level: 95 })).toMatchObject({
    reason: 'needsConfirmation',
  })
  session.stop()
})

it('never sends blocked commands and refuses keys while the TV is off', async () => {
  const { tv, made, session } = await setup([new FakeRemote({ power: false })])
  expect(
    await tv.execute('tv', { type: 'inputSource', op: 'select', inputId: 'hdmi1' }),
  ).toMatchObject({ reason: 'blocked' })
  expect(await tv.execute('tv', { type: 'keypad', op: 'press', key: 'up' })).toMatchObject({
    reason: 'invalidState',
  })
  expect(made[0]?.sent).toEqual([])
  session.stop()
})

it('wakes a TV in deep standby with Wake-on-LAN, then confirms it is on', async () => {
  const away = () => Object.assign(new FakeRemote(), { reachable: false })
  const woken = new FakeRemote({ power: true })
  let wakes = 0
  const { tv, session } = await setup([away(), away(), woken], {
    mac: '02:00:5e:00:53:01',
    wake: async () => wakes++,
  })
  expect(tv.devices()[0]?.availability.status).toBe('offline')
  expect(await tv.execute('tv', { type: 'power', op: 'set', on: true })).toMatchObject({ ok: true })
  expect(wakes).toBe(1)
  session.stop()
})

it('does not trust a silent session: the 2026-10-16 stale state is re-read before acting', async () => {
  // The old session still says "off, muted, volume 0" but the TV has not spoken for a long time;
  // meanwhile someone turned it on and opened YouTube.
  const stale = new FakeRemote({ power: false, volume: { level: 0, max: 100, muted: true } })
  const truth = new FakeRemote({
    power: true,
    app: 'com.google.android.youtube.tv',
    volume: { level: 14, max: 100, muted: false },
  })
  const { tv, made, session } = await setup([stale, truth])
  await new Promise((r) => setTimeout(r, 250)) // older than freshMs
  const d = tv.devices()[0]!
  expect(d.availability.status).toBe('unknown')
  expect(capability(d, 'power')?.state.power).toEqual({ known: false })
  // A command reconnects first, so it acts on the TV's real state: on, volume 14.
  expect(await tv.execute('tv', { type: 'volume', op: 'step', direction: 'up' })).toMatchObject({
    ok: true,
  })
  expect(made).toHaveLength(2)
  expect(stale.sent).toEqual([])
  expect(truth.state.volume?.level).toBe(15)
  session.stop()
})

it('recognises an app by its package prefix', () => {
  expect(appFor('com.disney.player.regional')).toEqual({ id: 'disney', name: 'Disney+' })
})
