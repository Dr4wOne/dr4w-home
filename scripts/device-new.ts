// pnpm device:new <name> — scaffold packages/adapter-<name> from the recipe in docs/add-a-device.md.
// The new adapter starts as a simulated device, so its tests pass before any real protocol exists.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function files(name: string): Record<string, string> {
  const id = name
  const Pascal = name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())
  const title = name.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  return {
    'package.json': `${JSON.stringify(
      {
        name: `@dr4w-home/adapter-${id}`,
        version: '0.1.0',
        private: true,
        type: 'module',
        license: 'MIT',
        exports: { '.': './src/index.ts' },
        scripts: { typecheck: 'tsc -p .', test: 'vitest run' },
        dependencies: { '@dr4w-home/device-sdk': 'workspace:*' },
        devDependencies: { '@types/node': 'catalog:', typescript: 'catalog:', vitest: 'catalog:' },
      },
      null,
      2,
    )}\n`,
    'tsconfig.json': `{\n  "extends": "../../tsconfig.base.json",\n  "compilerOptions": { "lib": ["ES2023", "DOM"], "types": ["node"] },\n  "include": ["src"]\n}\n`,
    'src/index.ts': `// ${title} adapter. Starts as a simulated device; replace simulate() with the real protocol
// (docs/protocol.md) step by step, keeping the tests green.
import {
  type AdapterManifest,
  type Command,
  type CommandResult,
  type Danger,
  type Device,
  type DeviceAdapter,
  reported,
} from '@dr4w-home/device-sdk'

export type ${Pascal}Device = { id: string; name: string; room?: string }

export const manifest: AdapterManifest = {
  id: '${id}',
  name: '${title}',
  worksWith: 'Works with ${title}',
  categories: ['other'],
  capabilities: ['power'],
}

/** Command types this adapter must never send, whatever a caller asks. Fill in from docs/protocol.md. */
export const BLOCKED: Command['type'][] = []

export class ${Pascal}Adapter implements DeviceAdapter {
  readonly manifest = manifest
  private readonly state = new Map<string, Device>()
  private readonly listeners = new Set<(d: Device) => void>()

  constructor(devices: ${Pascal}Device[]) {
    for (const d of devices)
      this.state.set(d.id, {
        id: d.id,
        name: d.name,
        room: d.room,
        category: 'other', // tv, console, light, speaker, fan or other: picks the icon
        worksWith: manifest.worksWith,
        availability: { status: 'online', lastSeenAt: Date.now() },
        capabilities: [{ id: 'power', type: 'power', features: {}, state: { power: reported('off') } }],
      })
  }

  devices() {
    return [...this.state.values()]
  }

  subscribe(listener: (d: Device) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  danger(_device: Device, command: Command): Danger {
    return BLOCKED.includes(command.type) ? 'blocked' : 'none'
  }

  async health() {
    return { ok: true }
  }

  async execute(deviceId: string, command: Command): Promise<CommandResult> {
    const t0 = performance.now()
    const ms = () => Math.round(performance.now() - t0)
    const current = this.state.get(deviceId)
    if (!current) return { ok: false, reason: 'unsupported', detail: 'No such device', ms: ms() }
    if (this.danger(current, command) === 'blocked') return { ok: false, reason: 'blocked', ms: ms() }
    if (command.type !== 'power') return { ok: false, reason: 'unsupported', ms: ms() }
    // shortcut: simulated device; replace with the real protocol and read the state back from it
    const next = structuredClone(current)
    const power = next.capabilities.find((c) => c.type === 'power')
    if (power?.type === 'power') power.state = { power: reported(command.on ? 'on' : 'off') }
    this.state.set(deviceId, next)
    for (const l of this.listeners) l(next)
    return { ok: true, applied: 'confirmed', ms: ms() }
  }
}
`,
    'src/adapter.test.ts': `import { capability } from '@dr4w-home/device-sdk'
import { expect, it } from 'vitest'
import { BLOCKED, ${Pascal}Adapter } from './index.ts'

const make = () => new ${Pascal}Adapter([{ id: '${id}', name: '${title}' }])

it('turns on and reports the new state', async () => {
  const a = make()
  const seen: string[] = []
  a.subscribe((d) => seen.push(d.id))
  expect(await a.execute('${id}', { type: 'power', op: 'set', on: true })).toMatchObject({ ok: true, applied: 'confirmed' })
  const [device] = a.devices()
  expect(device && capability(device, 'power')?.state.power).toMatchObject({ value: 'on', source: 'reported' })
  expect(seen).toEqual(['${id}'])
})

it('never lets a blocked command reach the device', async () => {
  const a = make()
  const sent: string[] = []
  a.subscribe((d) => sent.push(d.id))
  BLOCKED.push('volume')
  try {
    expect(await a.execute('${id}', { type: 'volume', op: 'set', level: 10 })).toMatchObject({ ok: false, reason: 'blocked' })
    expect(sent).toEqual([])
  } finally {
    BLOCKED.pop()
  }
})

it('refuses commands it does not support', async () => {
  expect(await make().execute('${id}', { type: 'volume', op: 'set', level: 10 })).toMatchObject({ ok: false, reason: 'unsupported' })
})
`,
    'fixtures/README.md': `# Fixtures\n\nScrubbed recordings of real device traffic only. Record into \`~/.config/dr4w-home/fixtures-raw/\`, then:\n\n    node scripts/privacy.ts scrub ~/.config/dr4w-home/fixtures-raw/<file> packages/adapter-${id}/fixtures/<file>\n`,
    'docs/discovery.md': `# ${title}: discovery\n\nWhat the device is, how it is reached, and what it answers to. Evidence for every line.\n\n## Checklist (docs/add-a-device.md)\n- [ ] 1. Discover the device and research its protocol\n- [ ] 2. Write docs/protocol.md with evidence\n- [ ] 3. Scaffold (done by pnpm device:new)\n- [ ] 4. Map capabilities\n- [ ] 5. Record and scrub fixtures\n- [ ] 6. Write the block-list\n- [ ] 7. Custom widget, if needed\n- [ ] 8. Tests and judges pass\n- [ ] 9. Row in docs/compatibility.md\n`,
    'docs/protocol.md': `# ${title}: protocol\n\nOne row per capability and command. Say which commands are blocked and why.\n\n| Capability | Message or call | Read-back | Verified on real hardware | Evidence |\n|---|---|---|---|---|\n| Power | | | No | |\n\n## Blocked commands\n\n| Command | Why |\n|---|---|\n`,
  }
}

/** Adds the import and the entry at the `device:new` markers of a registry file. */
export function register(source: string, importLine: string, entry: string): string {
  if (!source.includes('// device:new entries')) throw new Error('registry markers missing')
  const lines = source.split('\n')
  const lastImport = lines.reduce((at, l, i) => (/^import |^} from /.test(l) ? i : at), -1)
  lines.splice(lastImport + 1, 0, importLine)
  return lines
    .join('\n')
    .replace(
      /^(\s*)\/\/ device:new entries/m,
      (_, indent: string) => `${indent}${entry}\n${indent}// device:new entries`,
    )
}

function addDependency(pkgFile: string, name: string) {
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  pkg.dependencies[name] = 'workspace:*'
  pkg.dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
}

if (import.meta.main) {
  const name = process.argv[2] ?? ''
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(name)) {
    console.error('usage: pnpm device:new <name>   (kebab-case, e.g. demo-fan)')
    process.exit(2)
  }
  const dir = join('packages', `adapter-${name}`)
  if (existsSync(dir)) {
    console.error(`${dir} already exists`)
    process.exit(1)
  }
  for (const [path, body] of Object.entries(files(name))) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  const Pascal = name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())
  const title = name.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  const pkgName = `@dr4w-home/adapter-${name}`
  const hub = 'apps/hub/src/adapters.ts'
  writeFileSync(
    hub,
    register(
      readFileSync(hub, 'utf8'),
      `import { ${Pascal}Adapter } from '${pkgName}'`,
      `'${name}': define({ device: BasicDevice, create: (devices) => new ${Pascal}Adapter(devices) }),`,
    ),
  )
  addDependency('apps/hub/package.json', pkgName)
  const demo = 'packages/client/src/demo-adapters.ts'
  writeFileSync(
    demo,
    register(
      readFileSync(demo, 'utf8'),
      `import { ${Pascal}Adapter } from '${pkgName}'`,
      `new ${Pascal}Adapter([{ id: '${name}', name: '${title}', room: 'Living room' }]),`,
    ),
  )
  addDependency('packages/client/package.json', pkgName)
  execFileSync('pnpm', ['install', '--offline'], { stdio: 'inherit' })
  execFileSync('pnpm', ['exec', 'biome', 'check', '--write', dir, hub, demo], { stdio: 'inherit' })
  console.log(`
Created ${dir} and registered it:
  - the hub loads it for config entries { "type": "${name}", "devices": [{ "id", "name", "room" }] } (${hub})
  - demo mode shows one simulated "${title}" (${demo}); remove that entry once the adapter needs real hardware
Next: follow docs/add-a-device.md; the checklist is in ${dir}/docs/discovery.md.`)
}
