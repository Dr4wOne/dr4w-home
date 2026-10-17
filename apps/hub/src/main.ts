// The hub: loads the adapters from the config, serves the API and the web app on the home network.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEMO_SCENES } from '@dr4w-home/adapter-demo'
import type { Hub } from '@dr4w-home/adapter-nintendo-switch'
import type { Device, DeviceAdapter } from '@dr4w-home/device-sdk'
import { serve } from '@hono/node-server'
import { WebSocketServer } from 'ws'
import { ADAPTERS, type AdapterTypeName } from './adapters.ts'
import { configPath, loadConfig } from './config.ts'
import { log } from './log.ts'
import { ProfileStore } from './profiles.ts'
import { Registry } from './registry.ts'
import { createApp } from './server.ts'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string
}
const { config, demo, dir } = loadConfig()
if (demo)
  log('info', 'no devices configured: running in demo mode with simulated devices', {
    config: configPath(),
  })

// Adapters are created before the registry, so `hub` forwards to it once it exists.
const hubListeners = new Set<(d: Device) => void>()
const hub: Hub = {
  devices: () => registry.devices(),
  execute: (id, command) => registry.execute(id, command),
  subscribe: (l) => {
    hubListeners.add(l)
    return () => hubListeners.delete(l)
  },
}
const adapters: DeviceAdapter[] = []
for (const a of config.adapters) {
  const t = ADAPTERS[a.type as AdapterTypeName]
  adapters.push(await t.create((a.devices ?? []) as never[], { log, hub }))
}
const scenes = config.scenes.length || !demo ? config.scenes : DEMO_SCENES
const registry = new Registry(adapters, scenes)
registry.subscribe((d) => {
  for (const l of hubListeners) l(d)
})

const stateDir = config.stateDir ?? dir
const secretFile = join(stateDir, 'hub-secret')
if (!existsSync(secretFile)) {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 })
  writeFileSync(secretFile, randomBytes(32).toString('hex'), { mode: 0o600 })
}

function lanAddress(): string {
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? [])
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('172.')) return a.address
  return '127.0.0.1'
}
// Behind `tailscale serve`, set DR4W_HOME_URL to the https://…ts.net address so sign-in links use it.
const baseUrl =
  process.env.DR4W_HOME_URL ??
  `http://${config.bind === '127.0.0.1' ? '127.0.0.1' : lanAddress()}:${config.port}`

const app = createApp({
  registry,
  profiles: new ProfileStore(join(dir, 'controller-profiles.json')),
  secret: Buffer.from(readFileSync(secretFile, 'utf8').trim(), 'hex'),
  baseUrl,
  version: pkg.version,
  webDir: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
})

const websocket = { server: new WebSocketServer({ noServer: true }) }
serve({ fetch: app.fetch, port: config.port, hostname: config.bind, websocket }, () =>
  log('info', 'hub listening', { url: baseUrl, devices: registry.devices().length, demo }),
)
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    void registry.close().then(() => process.exit(0))
  })
