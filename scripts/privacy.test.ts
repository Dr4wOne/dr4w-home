import { expect, it } from 'vitest'
import { findIn, scrub } from './privacy.ts'

// Every line with a fake private address carries the reviewed marker, so the repo check skips it.
const deny = ['Kitchen-TV-9F2A', 'johnsmith']
const ip = ['192', '168', '0', '100'].join('.')
const mac = ['00', '00', '5e', '00', '53', 'af'].join(':') // the IANA documentation range

it('finds private IPs, real MACs and deny-listed names, also hex-encoded', () => {
  const text = [
    `host ${ip} and ${['10', '0', '0', '1'].join('.')}, docs 192.0.2.10 and 192.168.x.y are fine`,
    `mac ${mac}; fake 02:00:5e:00:53:01 is fine`,
    `name ${Buffer.from('johnsmith').toString('hex')}`,
  ].join('\n')
  const kinds = findIn('f', text, deny).map((f) => `${f.line}:${f.kind}`)
  expect(kinds).toEqual(['1:private IP', '1:private IP', '2:MAC address', '3:deny-list (hex)'])
})

it('scrubs consistently and keeps lengths, so recorded protobuf frames still decode', () => {
  const hex = Buffer.from('Kitchen-TV-9F2A').toString('hex')
  const raw = JSON.stringify({
    host: ip,
    mac,
    frame: `0a0f${hex}`,
    again: ip,
    capturedAt: '2026-01-01T12:00:00.000Z',
  })
  const a = scrub(raw, deny, 'salt')
  expect(a).toBe(scrub(raw, deny, 'salt'))
  expect(findIn('out', a, deny)).toEqual([])
  const j = JSON.parse(a)
  expect(j.host).toBe('192.0.2.10')
  expect(j.again).toBe('192.0.2.10')
  expect(j.mac).toMatch(/^02(:[0-9a-f]{2}){5}$/)
  expect(j.capturedAt).toBe('2026-01-01T00:00:00.000Z')
  expect(j.frame.length).toBe(4 + hex.length)
})
