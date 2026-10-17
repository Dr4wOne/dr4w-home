// Privacy tooling for a public repo (docs/security.md → Privacy).
//   node scripts/privacy.ts check                 fail on private IPs, MAC addresses and deny-listed identifiers in tracked files
//   node scripts/privacy.ts check --deny-only     only deny-listed identifiers (for old commits, whose test data used fake IPs)
//   node scripts/privacy.ts scrub <in> <out>      turn a raw recorded fixture into a public one
// The deny-list never lives in the repo: PRIVACY_DENYLIST (newline-separated; a CI secret) or
// ~/.config/dr4w-home/deny-list.txt. Scrubbing also needs PRIVACY_SALT or ~/.config/dr4w-home/salt so
// fake values stay the same from run to run.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const home = join(homedir(), '.config', 'dr4w-home')
const readPrivate = (env: string, file: string) =>
  process.env[env] ?? (existsSync(join(home, file)) ? readFileSync(join(home, file), 'utf8') : '')

export const denyList = (raw = readPrivate('PRIVACY_DENYLIST', 'deny-list.txt')) =>
  raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 4 && !l.startsWith('#'))

// RFC 1918 and link-local IPv4; documentation ranges (192.0.2/24, 198.51.100/24, 203.0.113/24) are fine.
const PRIVATE_IP =
  /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2})\b/g
// Real MACs; locally administered fakes starting 02: and all-zero examples are allowed.
const MAC = /\b(?!02[:-])(?!00[:-]00[:-]00)[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}\b/gi

export type Finding = { file: string; line: number; kind: string; text: string }

export function findIn(file: string, text: string, deny: string[]): Finding[] {
  const out: Finding[] = []
  const needles = deny.flatMap((d) => [
    { kind: 'deny-list', n: d.toLowerCase() },
    { kind: 'deny-list (hex)', n: Buffer.from(d).toString('hex') },
  ])
  text.split('\n').forEach((l, i) => {
    if (l.includes('privacy-allow')) return // fake values in tests and docs, reviewed
    for (const m of l.matchAll(PRIVATE_IP))
      out.push({ file, line: i + 1, kind: 'private IP', text: m[0] })
    for (const m of l.matchAll(MAC))
      out.push({ file, line: i + 1, kind: 'MAC address', text: m[0] })
    const low = l.toLowerCase()
    for (const { kind, n } of needles)
      if (low.includes(n)) out.push({ file, line: i + 1, kind, text: '(redacted)' })
  })
  return out
}

/** Same-length fake for an identifier, so protobuf lengths inside recorded frames stay valid. */
function fake(value: string, salt: string): string {
  const h = createHash('sha256').update(salt).update(value).digest()
  const letters = 'abcdefghjkmnpqrstuvwxyz'
  return [...value]
    .map((c, i) =>
      /[0-9]/.test(c)
        ? String((h[i % 32] ?? 0) % 10)
        : /[A-Za-z]/.test(c)
          ? letters[(h[i % 32] ?? 0) % letters.length]
          : c,
    )
    .join('')
}

export function scrub(text: string, deny: string[], salt: string): string {
  const ips = new Map<string, string>()
  let out = text
    // Times of day hint at routines; keep only the date.
    .replace(/(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '$1T00:00:00.000Z')
    .replace(
      /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g,
      '-----REDACTED CERTIFICATE-----',
    )
    .replace(/"(?:[A-Za-z0-9+/]{200,}={0,2})"/g, '"REDACTED-BASE64"')
    .replace(PRIVATE_IP, (ip) => {
      if (!ips.has(ip)) ips.set(ip, `192.0.2.${ips.size + 10}`)
      return ips.get(ip) as string
    })
    .replace(MAC, (mac) => {
      // A locally administered MAC (02:…) derived from the real one, so it stays valid hex and consistent.
      const h = createHash('sha256').update(salt).update(mac.toLowerCase()).digest('hex')
      return [
        '02',
        h.slice(0, 2),
        h.slice(2, 4),
        h.slice(4, 6),
        h.slice(6, 8),
        h.slice(8, 10),
      ].join(':')
    })
  for (const d of deny) {
    const f = fake(d, salt)
    out = out.split(d).join(f)
    out = out.split(Buffer.from(d).toString('hex')).join(Buffer.from(f).toString('hex'))
  }
  return out
}

function tracked(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(
      (f) =>
        f &&
        !f.startsWith('.claude/skills/') &&
        !/\.(png|jpe?g|webp|mp4|webm|woff2?|ico)$/.test(f) &&
        f !== 'pnpm-lock.yaml',
    )
}

if (import.meta.main) {
  const [cmd, a, b] = process.argv.slice(2)
  const denyOnly = a === '--deny-only'
  if (cmd === 'check') {
    const deny = denyList()
    if (!deny.length)
      console.warn('privacy: no deny-list found; checking IPs and MAC addresses only')
    const findings = tracked()
      .flatMap((f) => (existsSync(f) ? findIn(f, readFileSync(f, 'utf8'), deny) : []))
      .filter((x) => !denyOnly || x.kind.startsWith('deny-list'))
    for (const x of findings) console.log(`${x.file}:${x.line}  ${x.kind}  ${x.text}`)
    console.log(findings.length ? `privacy: ${findings.length} finding(s)` : 'privacy: clean')
    process.exit(findings.length ? 1 : 0)
  } else if (cmd === 'scrub' && a && b) {
    const salt = readPrivate('PRIVACY_SALT', 'salt').trim()
    if (!salt) throw new Error('Set PRIVACY_SALT or create ~/.config/dr4w-home/salt first')
    const deny = denyList()
    const result = scrub(readFileSync(a, 'utf8'), deny, salt)
    const left = findIn(b, result, deny)
    if (left.length)
      throw new Error(
        `Scrubbed output still has ${left.length} finding(s); add them to the deny-list`,
      )
    writeFileSync(b, result)
    console.log(`scrubbed ${a} → ${b}`)
  } else {
    console.log('usage: node scripts/privacy.ts check | scrub <in> <out>')
    process.exit(2)
  }
}
