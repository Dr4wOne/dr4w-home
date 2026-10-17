// The recorded sessions with the real TV (fixtures/*.json) drive these tests, so CI never needs it.
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:tls'
import { describe, expect, it } from 'vitest'
import { createIdentity } from './certs.ts'
import { decode, encode, frame, unframe } from './proto.ts'
import {
  AndroidTvRemote,
  CertificateMismatchError,
  interpret,
  keyFrame,
  type TvState,
} from './remote.ts'

type Frame = { dir: 'in' | 'out'; t: number; hex: string; step?: string }
const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${f}`, import.meta.url), 'utf8')) as {
    frames: Frame[]
  }
const caps = load('capabilities.json')
const hand = load('handshake-observe.json')
const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'))

describe('interpret() against the recorded TV', () => {
  it('reproduces every reply we sent during the recorded handshake', () => {
    const ins = hand.frames.filter((f) => f.dir === 'in')
    const outs = hand.frames.filter((f) => f.dir === 'out').map((f) => f.hex)
    const ours = ins
      .map((f) => interpret(decode(bytes(f.hex))).reply)
      .filter(Boolean)
      .map((r) => Buffer.from(encode(r ?? [])).toString('hex'))
    expect(ours).toEqual(outs)
  })

  it('follows the TV through home, app launch and power off', () => {
    let state: TvState = {}
    const after: Record<string, TvState> = {}
    for (const f of caps.frames) {
      if (f.dir === 'in') state = { ...state, ...interpret(decode(bytes(f.hex))).patch }
      if (f.step) after[f.step] = state
    }
    expect(after.connect).toMatchObject({ power: true, vendor: 'ACM', volume: { max: 100 } })
    expect(after.HOME?.app).toBe('com.google.android.apps.tv.launcherx')
    expect(after['launch YouTube']?.app).toBe('com.google.android.youtube.tv')
    expect(after['POWER off']?.power).toBe(false)
  })

  it('encodes keys exactly as the TV accepted them', () => {
    const sent = (step: string) =>
      caps.frames.find((f) => f.step === step && f.dir === 'out' && decode(bytes(f.hex)).has(10))
        ?.hex
    for (const k of ['HOME', 'DPAD_RIGHT', 'DPAD_LEFT', 'DPAD_DOWN', 'DPAD_UP'])
      expect(sent(k)).toBe(Buffer.from(encode(keyFrame(k))).toString('hex'))
  })

  it('refuses keys off the allow-list before anything is sent', () => {
    expect(() => keyFrame('SETTINGS')).toThrow(/allow-list/)
    expect(() => keyFrame('__proto__')).toThrow(/allow-list/)
  })
})

/** A local TLS server that plays the TV's side of the recorded handshake. */
async function fakeTv() {
  const id = await createIdentity('fake-tv')
  const ins = hand.frames.filter((f) => f.dir === 'in').slice(0, 5) // configure, active, volume, power, app
  const received: Uint8Array[] = []
  const server = createServer(
    { key: id.key, cert: id.cert, requestCert: true, rejectUnauthorized: false },
    (sock) => {
      let rest = new Uint8Array()
      sock.write(frame(bytes(ins[0]?.hex ?? '')))
      sock.on('data', (c: Buffer) => {
        const out = unframe(Uint8Array.from([...rest, ...c]))
        rest = Uint8Array.from(out.rest)
        for (const f of out.frames) {
          received.push(f)
          if (received.length === 1) sock.write(frame(bytes(ins[1]?.hex ?? '')))
          if (received.length === 2) for (const i of ins.slice(2)) sock.write(frame(bytes(i.hex)))
        }
      })
    },
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { id, received, port: (server.address() as AddressInfo).port, close: () => server.close() }
}

describe('AndroidTvRemote against a replayed TV', () => {
  it('connects, pins the certificate, reports state and sends allow-listed keys', async () => {
    const tv = await fakeTv()
    const client = await createIdentity('client')
    const r = new AndroidTvRemote({
      host: '127.0.0.1',
      port: tv.port,
      identity: client,
      pinnedCert: tv.id.cert,
    })
    await r.connect()
    expect(r.state).toMatchObject({
      power: true,
      app: 'com.example.tvplayer1', // the recorded app (scrubbed name)
      volume: { level: 18 },
    })
    r.sendKey('VOLUME_UP')
    await new Promise((res) => setTimeout(res, 100))
    expect(Buffer.from(tv.received.at(-1) ?? []).toString('hex')).toBe(
      Buffer.from(encode(keyFrame('VOLUME_UP'))).toString('hex'),
    )
    r.close()
    tv.close()
  }, 15_000)

  it('closes a session that has gone silent (a TV in deep standby leaves TCP half-open)', async () => {
    const tv = await fakeTv() // plays the handshake, then sends nothing, like a TV that left the network
    const r = new AndroidTvRemote({
      host: '127.0.0.1',
      port: tv.port,
      identity: await createIdentity('client'),
      pinnedCert: tv.id.cert,
      silenceMs: 600,
    })
    await r.connect()
    const t0 = Date.now()
    await new Promise<void>((res) => r.once('close', () => res()))
    expect(Date.now() - t0).toBeLessThan(2500)
    expect(Date.now() - r.lastFrameAt).toBeGreaterThanOrEqual(600)
    tv.close()
  }, 15_000)

  it('refuses a TV whose certificate changed since pairing', async () => {
    const tv = await fakeTv()
    const other = await createIdentity('someone-else')
    const r = new AndroidTvRemote({
      host: '127.0.0.1',
      port: tv.port,
      identity: await createIdentity('client'),
      pinnedCert: other.cert,
    })
    await expect(r.connect()).rejects.toBeInstanceOf(CertificateMismatchError)
    tv.close()
  }, 15_000)
})

describe('app links', () => {
  it('allows https links only (market:// made the real TV drop the session)', async () => {
    const r = new AndroidTvRemote({
      host: '127.0.0.1',
      identity: await createIdentity('c'),
      pinnedCert: (await createIdentity('t')).cert,
    })
    expect(() => r.launchAppLink('market://launch?id=com.google.android.youtube.tv')).toThrow(
      /https/,
    )
    expect(() => r.launchAppLink('javascript:alert(1)')).toThrow(/https/)
    expect(() => r.launchAppLink('https://www.youtube.com')).toThrow(/Not connected/) // valid, but no socket
  })
})
