// The hub's local config: which adapters and devices to load, and the owner's scenes. It lives
// outside the repo (default ~/.config/dr4w-home/config.json); examples/config has a fake one.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { CommandSchema, IdSchema } from '@dr4w-home/device-sdk/schema'
import { z } from 'zod'
import { ADAPTERS } from './adapters.ts'

// One config entry per adapter type in the registry: `{ type, devices }`, or `{ type }` for the demo.
const AdapterEntry = z.union(
  Object.entries(ADAPTERS).map(([type, t]) =>
    'device' in t && t.device
      ? z.strictObject({ type: z.literal(type), devices: z.array(t.device).min(1) })
      : z.strictObject({ type: z.literal(type) }),
  ) as unknown as [
    z.ZodType<{ type: string; devices?: unknown[] }>,
    ...z.ZodType<{ type: string; devices?: unknown[] }>[],
  ],
)

const Scene = z.strictObject({
  id: IdSchema,
  name: z.string().min(1).max(60),
  synonyms: z.array(z.string().max(60)).optional(),
  steps: z
    .array(
      z.strictObject({
        deviceId: IdSchema,
        command: CommandSchema,
        settleMs: z.number().int().min(0).max(30_000).optional(),
      }),
    )
    .min(1),
})

export const Config = z.strictObject({
  port: z.number().int().min(1).max(65535).default(8790),
  /** 0.0.0.0 for the home network; 127.0.0.1 behind `tailscale serve`. */
  bind: z.string().default('0.0.0.0'),
  /** Where the hub keeps its own secrets (the phone sign-in key). Default: the config's folder. */
  stateDir: z.string().optional(),
  adapters: z.array(AdapterEntry).default([{ type: 'demo' }]),
  scenes: z.array(Scene).default([]),
})
export type Config = z.infer<typeof Config>

export const configPath = () =>
  process.env.DR4W_HOME_CONFIG ?? join(homedir(), '.config', 'dr4w-home', 'config.json')

/** Reads and validates the config. No file means demo mode. Relative paths are relative to the file. */
export function loadConfig(file = configPath()): { config: Config; demo: boolean; dir: string } {
  const dir = dirname(resolve(file))
  if (!existsSync(file)) return { config: Config.parse({}), demo: true, dir }
  const config = Config.parse(JSON.parse(readFileSync(file, 'utf8')))
  const abs = (p: string) => resolve(dir, p.replace(/^~(?=\/)/, homedir()))
  for (const a of config.adapters)
    for (const d of (a.devices ?? []) as { stateDir?: string }[])
      if (d.stateDir) d.stateDir = abs(d.stateDir)
  if (config.stateDir) config.stateDir = abs(config.stateDir)
  return { config, demo: config.adapters.every((a) => a.type === 'demo'), dir }
}

/**
 * Adds a freshly paired TV to the config file, creating the file if there is none. Returns the
 * device id. Pure on the JSON so it can be tested; the caller writes the file.
 */
export function addTv(
  raw: unknown,
  tv: { name: string; stateDir: string; host: string; mac?: string },
) {
  const json = (raw && typeof raw === 'object' ? structuredClone(raw) : {}) as {
    adapters?: { type: string; devices?: { id: string }[] }[]
  }
  json.adapters = (json.adapters ?? []).filter((a) => a.type !== 'demo')
  let tvs = json.adapters.find((a) => a.type === 'android-tv')
  if (!tvs) {
    tvs = { type: 'android-tv', devices: [] }
    json.adapters.push(tvs)
  }
  const taken = new Set((tvs.devices ?? []).map((d) => d.id))
  let id = 'tv'
  for (let n = 2; taken.has(id); n++) id = `tv-${n}`
  tvs.devices = [...(tvs.devices ?? []), { id, ...tv }]
  Config.parse(json)
  return { json, id }
}

export function saveTv(
  tv: { name: string; stateDir: string; host: string; mac?: string },
  file = configPath(),
) {
  const raw = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const { json, id } = addTv(raw, tv)
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, { mode: 0o600 })
  return id
}
