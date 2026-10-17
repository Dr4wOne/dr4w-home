// pnpm hub pair <tv-ip> [name]   pair a TV (code shown on the TV) and add it to the config
// pnpm hub link                  QR code that signs a phone in (single use, 10 min)
// (pnpm hub = pnpm --filter @dr4w-home/hub cli)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pairTv } from '@dr4w-home/adapter-android-tv'
import QRCode from 'qrcode'
import { configPath, loadConfig, saveTv } from './config.ts'
import { adminProof } from './server.ts'

const [cmd, a, b] = process.argv.slice(2)

if (cmd === 'pair') {
  if (!a) throw new Error('usage: pnpm hub pair <tv-ip> [name]')
  const name = b ?? 'Living room TV'
  const stateDir = join(
    dirname(configPath()),
    'android-tv',
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  )
  const r = await pairTv(a, stateDir)
  const id = saveTv({ name, stateDir, host: a, mac: r.mac })
  console.log(
    `Paired in ${r.seconds.toFixed(1)} s${r.mac ? '; MAC address saved for Wake-on-LAN' : ''}.`,
  )
  console.log(`Added "${name}" (id ${id}) to ${configPath()}. Restart the hub to load it.`)
} else if (cmd === 'link') {
  const { config, dir } = loadConfig()
  // Only the hub's own user can read the secret, so only this machine's CLI can mint links.
  const secret = Buffer.from(
    readFileSync(join(config.stateDir ?? dir, 'hub-secret'), 'utf8').trim(),
    'hex',
  )
  const res = await fetch(`http://127.0.0.1:${config.port}/admin/link`, {
    method: 'POST',
    headers: { 'x-dr4w-admin': adminProof(secret) },
  }).catch(() => undefined)
  if (!res?.ok)
    throw new Error('The hub is not running on this machine (pnpm --filter @dr4w-home/hub start)')
  const { url, expiresInMinutes } = (await res.json()) as { url: string; expiresInMinutes: number }
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }))
  console.log(url)
  console.log(`Scan it with the phone's camera. It works once, for ${expiresInMinutes} minutes.`)
} else {
  console.log('usage: pnpm hub pair <tv-ip> [name] | pnpm hub link')
  process.exit(2)
}
