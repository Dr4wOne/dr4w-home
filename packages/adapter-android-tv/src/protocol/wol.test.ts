import { expect, it } from 'vitest'
import { magicPacket } from './wol.ts'

it('builds the 102-byte magic packet', () => {
  const p = magicPacket('02:00:5e:00:53:01')
  expect(p.length).toBe(102)
  expect(p.subarray(0, 6).every((b) => b === 0xff)).toBe(true)
  expect(p.subarray(6, 12).toString('hex')).toBe('02005e005301')
  expect(p.subarray(96).toString('hex')).toBe('02005e005301')
  expect(() => magicPacket('nope')).toThrow()
})
