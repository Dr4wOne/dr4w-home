// Pairs a TV into a state directory: client key and certificate, the TV's pinned certificate, and
// its MAC address for Wake-on-LAN. The TV shows a six-character code; `getCode` supplies it.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { loadIdentity, pair } from './protocol/index.ts'

export async function pairTv(host: string, stateDir: string, getCode = askCode) {
  const t0 = Date.now()
  const result = await pair({
    host,
    identity: await loadIdentity(stateDir),
    clientName: 'dr4w home',
    getCode,
    timeoutMs: 120_000,
    log: (e) => console.log(`[pair] ${e}`),
  })
  // The TV's MAC is in the ARP table now that we have talked to it.
  const mac = readFileSync('/proc/net/arp', 'utf8')
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .find((f) => f[0] === host)?.[3]
  const tv = {
    host,
    serverCert: result.serverCert,
    pairedAt: new Date().toISOString(),
    ...(mac && mac !== '00:00:00:00:00:00' ? { mac } : {}),
  }
  writeFileSync(join(stateDir, 'tv.json'), `${JSON.stringify(tv, null, 2)}\n`, { mode: 0o600 })
  return { seconds: (Date.now() - t0) / 1000, mac: tv.mac }
}

/** Reads the code from the terminal, or from TV_CODE_FILE when another process relays it. */
export async function askCode(): Promise<string> {
  const file = process.env.TV_CODE_FILE
  if (file) {
    while (!existsSync(file)) await new Promise((r) => setTimeout(r, 300))
    const code = readFileSync(file, 'utf8').trim()
    rmSync(file)
    return code
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const code = await rl.question('Code shown on the TV: ')
  rl.close()
  return code.trim()
}
