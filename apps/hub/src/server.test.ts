import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AndroidTvAdapter,
  createIdentity,
  FakeRemote,
  TvSession,
} from '@dr4w-home/adapter-android-tv'
import { DEMO_SCENES, DemoAdapter } from '@dr4w-home/adapter-demo'
import { describe, expect, it } from 'vitest'
import { Config } from './config.ts'
import { Registry } from './registry.ts'
import { adminProof, createApp } from './server.ts'

async function setup(opts: { as?: string; webDir?: string; tv?: FakeRemote } = {}) {
  const demo = new DemoAdapter({ speed: 0, random: () => 0.5 })
  const tvRemote = opts.tv ?? new FakeRemote()
  const id = await createIdentity('t')
  const session = new TvSession({
    host: '192.0.2.10',
    identity: id,
    pinnedCert: id.cert,
    freshMs: 60_000,
    makeRemote: () => tvRemote,
  })
  const tv = new AndroidTvAdapter({ readbackMs: 300 })
  tv.addSession({ id: 'real-tv', name: 'Bedroom TV', stateDir: '/x' }, session)
  session.start()
  await new Promise((r) => setTimeout(r, 10))
  const registry = new Registry([demo, tv], DEMO_SCENES)
  let as = opts.as ?? '192.0.2.50'
  const app = createApp({
    registry,
    secret: Buffer.alloc(32, 7),
    baseUrl: 'http://192.0.2.1:8790',
    version: '0.1.0',
    clientIp: () => as,
    pingMs: 50,
    ...(opts.webDir ? { webDir: opts.webDir } : {}),
  })
  const signIn = async () => {
    as = '127.0.0.1'
    const { url } = (await (
      await app.request('/admin/link', {
        method: 'POST',
        headers: { 'x-dr4w-admin': adminProof(Buffer.alloc(32, 7)) },
      })
    ).json()) as {
      url: string
    }
    as = '192.0.2.50'
    const u = new URL(url)
    const res = await app.request(u.pathname + u.search)
    return {
      res,
      url: u.pathname + u.search,
      cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '',
    }
  }
  const post = (
    path: string,
    cookie: string,
    body: unknown,
    headers: Record<string, string> = { 'x-dr4w-client': '1' },
  ) =>
    app.request(path, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  return { app, demo, tvRemote, session, signIn, post, setIp: (v: string) => (as = v) }
}

describe('signing a phone in', () => {
  it('keeps /api closed, mints links only on the hub machine, and each link works once', async () => {
    const { app, signIn, session } = await setup()
    expect(await (await app.request('/health')).json()).toMatchObject({ ok: true, signedIn: false })
    expect((await app.request('/api/devices')).status).toBe(403)
    expect((await app.request('/admin/link', { method: 'POST' })).status).toBe(403)
    const { res, url, cookie } = await signIn()
    expect(res.status).toBe(302)
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(res.headers.get('set-cookie')).toMatch(/SameSite=Strict/i)
    expect((await app.request(url)).status).toBe(403)
    expect(await (await app.request('/health', { headers: { cookie } })).json()).toMatchObject({
      signedIn: true,
    })
    expect(
      (await app.request('/api/devices', { headers: { cookie: 'dr4w_home=forged' } })).status,
    ).toBe(403)
    session.stop()
  })
})

describe('commands', () => {
  it('needs the CSRF header and rejects anything the schema does not allow', async () => {
    const { signIn, post, session } = await setup()
    const { cookie } = await signIn()
    expect(
      (
        await post(
          '/api/devices/tv/commands',
          cookie,
          { command: { type: 'power', op: 'set', on: true } },
          {},
        )
      ).status,
    ).toBe(403)
    for (const command of [
      { type: 'raw', code: 176 },
      { type: 'keypad', op: 'press', key: 'settings' },
      { type: 'appLauncher', op: 'launch', appId: 'market://details?id=x' },
      { type: 'volume', op: 'set', level: 500 },
    ])
      expect((await post('/api/devices/tv/commands', cookie, { command })).status).toBe(400)
    expect(
      (
        await post('/api/devices/nope/commands', cookie, {
          command: { type: 'power', op: 'set', on: true },
        })
      ).status,
    ).toBe(404)
    session.stop()
  })

  it('runs a command, asks before a loud one, and never sends a blocked one', async () => {
    const { signIn, post, tvRemote, session } = await setup()
    const { cookie } = await signIn()
    const run = async (id: string, command: unknown, confirmed?: boolean) =>
      (
        await post(`/api/devices/${id}/commands`, cookie, {
          command,
          ...(confirmed ? { confirmed } : {}),
        })
      ).json()
    expect(await run('tv', { type: 'power', op: 'set', on: true })).toMatchObject({ ok: true })
    expect(await run('real-tv', { type: 'volume', op: 'set', level: 95 })).toMatchObject({
      reason: 'needsConfirmation',
    })
    expect(tvRemote.sent).toEqual([])
    expect(
      await run('real-tv', { type: 'inputSource', op: 'select', inputId: 'hdmi1' }),
    ).toMatchObject({ reason: 'blocked' })
    expect(tvRemote.sent).toEqual([])
    expect(await run('real-tv', { type: 'volume', op: 'set', level: 20 })).toMatchObject({
      ok: true,
      applied: 'confirmed',
    })
    expect(tvRemote.sent).toEqual(['VOLUME_UP', 'VOLUME_UP'])
    session.stop()
  })

  it('runs a scene on the hub', async () => {
    const { app, signIn, post, session } = await setup()
    const { cookie } = await signIn()
    expect(await (await post('/api/scenes/movie-night/run', cookie, {})).json()).toEqual({
      ok: true,
    })
    expect((await post('/api/scenes/nope/run', cookie, {})).status).toBe(404)
    const tv = (
      (await (await app.request('/api/devices', { headers: { cookie } })).json()) as {
        id: string
      }[]
    ).find((d) => d.id === 'tv')
    expect(JSON.stringify(tv)).toContain('Netflix')
    session.stop()
  })
})

describe('state', () => {
  it('streams device updates as server-sent events', async () => {
    const { app, signIn, demo, session } = await setup()
    const { cookie } = await signIn()
    const res = await app.request('/api/events', { headers: { cookie } })
    const reader = res.body?.getReader()
    void demo.execute('lamp', { type: 'lightLevel', op: 'set', level: 33 })
    let text = ''
    while (!text.includes('"value":33'))
      text += new TextDecoder().decode((await reader?.read())?.value)
    expect(text).toMatch(/event: device/)
    await reader?.cancel()
    session.stop()
  })

  it('reports a TV whose session went silent as unknown, not with its old state', async () => {
    const tv = new FakeRemote({ power: false })
    const { app, signIn, session } = await setup({ tv })
    const { cookie } = await signIn()
    tv.lastFrameAt = Date.now() - 120_000
    const devices = (await (await app.request('/api/devices', { headers: { cookie } })).json()) as {
      id: string
      availability: { status: string }
    }[]
    expect(devices.find((d) => d.id === 'real-tv')?.availability.status).toBe('unknown')
    session.stop()
  })
})

describe('web app and config', () => {
  it('serves the built app with an SPA fallback and cache headers', async () => {
    const web = mkdtempSync(join(tmpdir(), 'web-'))
    mkdirSync(join(web, 'assets'))
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>hub</title>')
    writeFileSync(join(web, 'assets', 'app-abc123.js'), 'console.log(1)')
    const { app, session } = await setup({ webDir: web })
    const asset = await app.request('/assets/app-abc123.js')
    expect(asset.headers.get('cache-control')).toMatch(/immutable/)
    const deep = await app.request('/devices/tv')
    expect(await deep.text()).toContain('<title>hub</title>')
    expect(deep.headers.get('cache-control')).toBe('no-cache')
    session.stop()
  })

  it('validates the config and falls back to demo mode', () => {
    expect(Config.parse({})).toMatchObject({ port: 8790, adapters: [{ type: 'demo' }] })
    expect(() =>
      Config.parse({
        adapters: [{ type: 'android-tv', devices: [{ id: 'TV!', name: 'x', stateDir: '.' }] }],
      }),
    ).toThrow()
    expect(() =>
      Config.parse({
        scenes: [
          { id: 's', name: 'S', steps: [{ deviceId: 'tv', command: { type: 'raw', code: 176 } }] },
        ],
      }),
    ).toThrow()
  })
})

describe('pairing adds the TV to the config', () => {
  it('creates a config, replaces demo mode, and picks a free id', async () => {
    const { addTv } = await import('./config.ts')
    const first = addTv(
      { adapters: [{ type: 'demo' }] },
      { name: 'TV', stateDir: '/s/a', host: '192.0.2.10' },
    )
    expect(first.id).toBe('tv')
    expect(first.json.adapters).toEqual([
      {
        type: 'android-tv',
        devices: [{ id: 'tv', name: 'TV', stateDir: '/s/a', host: '192.0.2.10' }],
      },
    ])
    expect(addTv(first.json, { name: 'Bedroom TV', stateDir: '/s/b', host: '192.0.2.11' }).id).toBe(
      'tv-2',
    )
    expect(addTv(undefined, { name: 'TV', stateDir: '/s/a', host: '192.0.2.10' }).id).toBe('tv')
  })
})

describe('minting sign-in links behind a reverse proxy', () => {
  it('refuses loopback requests without the proof, and anything forwarded by a proxy', async () => {
    const { app } = await setup({ as: '127.0.0.1' })
    const proof = adminProof(Buffer.alloc(32, 7))
    const post = (headers: Record<string, string>) =>
      app.request('/admin/link', { method: 'POST', headers })
    expect((await post({ 'x-dr4w-admin': 'wrong' })).status).toBe(403)
    expect((await post({ 'x-dr4w-admin': proof, 'x-forwarded-for': '100.64.0.9' })).status).toBe(
      403,
    )
    expect(
      (await post({ 'x-dr4w-admin': proof, 'tailscale-user-login': 'someone@example.com' })).status,
    ).toBe(403)
    expect((await post({})).status).toBe(403)
    expect((await post({ 'x-dr4w-admin': proof })).status).toBe(200)
  })
})
