// Saved controller layouts, one JSON file next to the hub config (mode 0600). The built-in presets
// come first and cannot be changed or deleted.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { type ControllerProfile, PRESETS } from '@dr4w-home/device-sdk'
import { ControllerProfileSchema } from '@dr4w-home/device-sdk/schema'
import { z } from 'zod'

export const MAX_PROFILES = 50
const builtIn = new Set(PRESETS.map((p) => p.id))

export class ProfileStore {
  readonly file: string
  constructor(file: string) {
    this.file = file
  }

  #saved(): ControllerProfile[] {
    if (!existsSync(this.file)) return []
    return z.array(ControllerProfileSchema).parse(JSON.parse(readFileSync(this.file, 'utf8')))
  }

  #write(list: ControllerProfile[]) {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`, { mode: 0o600 })
    renameSync(tmp, this.file)
  }

  list(): ControllerProfile[] {
    return [...PRESETS, ...this.#saved()]
  }

  put(p: ControllerProfile): 'ok' | 'read_only' | 'too_many' {
    if (builtIn.has(p.id)) return 'read_only'
    const list = this.#saved()
    const i = list.findIndex((x) => x.id === p.id)
    if (i < 0 && list.length >= MAX_PROFILES) return 'too_many'
    if (i < 0) list.push(p)
    else list[i] = p
    this.#write(list)
    return 'ok'
  }

  delete(id: string): 'ok' | 'read_only' | 'not_found' {
    if (builtIn.has(id)) return 'read_only'
    const list = this.#saved()
    const next = list.filter((x) => x.id !== id)
    if (next.length === list.length) return 'not_found'
    this.#write(next)
    return 'ok'
  }
}
