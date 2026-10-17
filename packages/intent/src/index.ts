// The command bar's text → action engine. The default is deterministic: scene names and synonyms,
// a small grammar for device commands, and typo-tolerant matching (dictation often mishears one
// letter). Other providers (an LLM with the user's own key) plug in through IntentProvider.
import { type Command, capability, type Device, type Scene } from '@dr4w-home/device-sdk'

export type Action =
  | { kind: 'scene'; sceneId: string }
  | { kind: 'command'; deviceId: string; command: Command }
export type Intent = { label: string; action: Action; score: number }
export type IntentContext = { devices: Device[]; scenes: Scene[] }

export interface IntentProvider {
  readonly id: string
  interpret(text: string, ctx: IntentContext): Promise<Intent[]>
}

const FILLER = new Set([
  'the',
  'a',
  'an',
  'please',
  'lets',
  'let',
  'us',
  'to',
  'my',
  'and',
  'now',
  'can',
  'you',
  'i',
  'want',
])
const ALIASES: Record<string, string> = {
  telly: 'tv',
  television: 'tv',
  light: 'lamp',
  lights: 'lamp',
  nintendo: 'switch',
  nite: 'night',
  lite: 'lamp',
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .split(/[^a-z0-9%+]+/)
    .filter((t) => t && !FILLER.has(t))
    .map((t) => ALIASES[t] ?? t)
}

/** Edit distance with a cap; enough for one or two misheard letters. */
function distance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    prev = cur
  }
  return prev[b.length] ?? cap + 1
}

const close = (a: string, b: string) =>
  a === b || (a.length >= 4 && b.length >= 4 && distance(a, b) <= 1)

/** Share of the phrase's tokens found (fuzzily) in the input. */
function overlap(input: string[], phrase: string[]): number {
  if (!phrase.length) return 0
  return phrase.filter((p) => input.some((t) => close(t, p))).length / phrase.length
}

function deviceIn(input: string[], devices: Device[]): Device | undefined {
  let best: { d: Device; s: number } | undefined
  for (const d of devices) {
    const names = [d.name, d.id, d.category === 'tv' ? 'tv' : d.category === 'light' ? 'lamp' : '']
    for (const n of names) {
      const s = overlap(input, tokens(n))
      // "switch 2" must beat "switch": prefer the longer full match
      const score = s === 1 ? 1 + tokens(n).length / 10 : s
      if (score > (best?.s ?? 0.5)) best = { d, s: score }
    }
  }
  return best?.d
}

const has = (input: string[], ...words: string[]) =>
  words.some((w) => input.some((t) => close(t, w)))
const number = (input: string[]) => {
  const n = input.map((t) => Number.parseInt(t, 10)).find((n) => Number.isFinite(n))
  return n === undefined ? undefined : n
}

export function interpret(text: string, ctx: IntentContext): Intent[] {
  const input = tokens(text)
  const out: Intent[] = []

  for (const s of ctx.scenes) {
    const score = Math.max(...[s.name, ...(s.synonyms ?? [])].map((p) => overlap(input, tokens(p))))
    if (score >= 0.6) out.push({ label: s.name, action: { kind: 'scene', sceneId: s.id }, score })
  }

  const d = deviceIn(input, ctx.devices)
  const target = d ?? ctx.devices.find((x) => x.category === 'tv')
  const cmd = (label: string, command: Command, dev: Device, score = 0.9) =>
    out.push({ label, action: { kind: 'command', deviceId: dev.id, command }, score })

  if (target) {
    const n = number(input)
    const off = has(input, 'off') || input.join(' ').includes('shut down')
    const on = has(input, 'on', 'wake', 'start')
    if (d && capability(d, 'power') && (on || off) && !has(input, 'volume', 'mute'))
      cmd(`Turn ${d.name} ${off ? 'off' : 'on'}`, { type: 'power', op: 'set', on: !off }, d, 0.95)

    if (capability(target, 'volume') && has(input, 'volume', 'louder', 'quieter', 'sound')) {
      if (n !== undefined)
        cmd(`${target.name} volume ${n}`, { type: 'volume', op: 'set', level: n }, target)
      else if (has(input, 'up', 'louder'))
        cmd(`${target.name} volume up`, { type: 'volume', op: 'step', direction: 'up' }, target)
      else if (has(input, 'down', 'quieter'))
        cmd(`${target.name} volume down`, { type: 'volume', op: 'step', direction: 'down' }, target)
    }
    if (capability(target, 'mute') && has(input, 'mute', 'unmute', 'silence'))
      cmd(
        `${has(input, 'unmute') ? 'Unmute' : 'Mute'} ${target.name}`,
        { type: 'mute', op: 'set', muted: !has(input, 'unmute') },
        target,
      )

    const apps = capability(target, 'appLauncher')?.features.catalog ?? []
    for (const app of apps)
      if (app.id !== 'home' && overlap(input, tokens(app.name)) === 1)
        cmd(
          `Open ${app.name} on ${target.name}`,
          { type: 'appLauncher', op: 'launch', appId: app.id },
          target,
          0.92,
        )
  }

  const lamp = d?.category === 'light' ? d : undefined
  if (lamp) {
    const n = number(input)
    if (n !== undefined || has(input, 'dim', 'brighter', 'bright'))
      cmd(
        `${lamp.name} ${n ?? (has(input, 'dim') ? 20 : 100)}%`,
        { type: 'lightLevel', op: 'set', level: n ?? (has(input, 'dim') ? 20 : 100) },
        lamp,
      )
    if (has(input, 'warm', 'cool', 'cold', 'daylight'))
      cmd(
        `${lamp.name} ${has(input, 'warm') ? 'warm' : 'cool'} white`,
        { type: 'lightColor', op: 'set', kelvin: has(input, 'warm') ? 2700 : 5000 },
        lamp,
      )
  }

  return out.sort((a, b) => b.score - a.score)
}

/** Every action, for the palette when the bar is empty. */
export function palette(ctx: IntentContext): Intent[] {
  const out: Intent[] = ctx.scenes.map((s) => ({
    label: s.name,
    action: { kind: 'scene', sceneId: s.id },
    score: 1,
  }))
  for (const d of ctx.devices) {
    const p = capability(d, 'power')?.state.power
    if (p) {
      const on = p.known && p.value === 'on'
      out.push({
        label: `Turn ${d.name} ${on ? 'off' : 'on'}`,
        action: { kind: 'command', deviceId: d.id, command: { type: 'power', op: 'set', on: !on } },
        score: 0.5,
      })
    }
  }
  return out
}

export const deterministic: IntentProvider = {
  id: 'deterministic',
  interpret: async (text, ctx) => interpret(text, ctx),
}
