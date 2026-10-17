// A real hub on a loopback port with one Switch on the given output: for the socket tests and
// scripts/gamepad-latency.ts. No TV behind it, and nothing leaves the machine.
import { randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NintendoSwitchAdapter } from '@dr4w-home/adapter-nintendo-switch'
import type { GamepadOutput } from '@dr4w-home/device-sdk'
import { serve } from '@hono/node-server'
import { WebSocketServer } from 'ws'
import { ProfileStore } from './profiles.ts'
import { Registry } from './registry.ts'
import { adminProof, createApp } from './server.ts'

export async function startTestHub(output: GamepadOutput) {
  const adapter = new NintendoSwitchAdapter(
    [
      {
        id: 'switch2',
        name: 'Switch 2',
        tvDeviceId: 'tv',
        tvInputId: 'hdmi2',
        tvInputAppId: 'tv-input',
        output: { kind: 'demo' },
      },
    ],
    {
      hub: {
        devices: () => [],
        subscribe: () => () => {},
        execute: async () => ({ ok: false, reason: 'unsupported', ms: 0 }),
      },
      makeOutput: () => output,
    },
  )
  const registry = new Registry([adapter], [])
  const secret = randomBytes(32)
  let app: ReturnType<typeof createApp> | undefined
  const server = serve({
    fetch: (req, env) => (app as ReturnType<typeof createApp>).fetch(req, env),
    port: 0,
    hostname: '127.0.0.1',
    websocket: { server: new WebSocketServer({ noServer: true }) },
  })
  await new Promise((r) => server.once('listening', r))
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  app = createApp({
    registry,
    profiles: new ProfileStore(join(mkdtempSync(join(tmpdir(), 'dr4w-hub-')), 'profiles.json')),
    secret,
    baseUrl,
    version: 'test',
    clientIp: () => '127.0.0.1',
  })
  const link = (await (
    await app.request('/admin/link', {
      method: 'POST',
      headers: { 'x-dr4w-admin': adminProof(secret) },
    })
  ).json()) as { url: string }
  const u = new URL(link.url)
  const res = await app.request(u.pathname + u.search)
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  return {
    baseUrl,
    cookie,
    wsUrl: (deviceId = 'switch2') => `${baseUrl.replace('http', 'ws')}/api/gamepad/${deviceId}`,
    close: async () => {
      await registry.close()
      await new Promise((r) => server.close(r))
    },
  }
}
