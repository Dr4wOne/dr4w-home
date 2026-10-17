import { expect, it } from 'vitest'
import { decode, encode, frame, num, str, unframe } from './proto.ts'

it('round-trips varints, strings and nested messages', () => {
  const bytes = encode([
    [1, 2],
    [2, 200],
    [
      10,
      [
        [1, 'atvremote'],
        [2, 'dr4w bridge'],
      ],
    ],
  ])
  const d = decode(bytes)
  expect(num(d, 1)).toBe(2)
  expect(num(d, 2)).toBe(200)
  const inner = decode(d.get(10)?.[0] as Uint8Array)
  expect(str(inner, 1)).toBe('atvremote')
  expect(str(inner, 2)).toBe('dr4w bridge')
})

it('encodes 300 as the protobuf spec example (ac 02)', () => {
  expect([...encode([[1, 300]])]).toEqual([0x08, 0xac, 0x02])
})

it('splits a stream into frames and keeps partial data', () => {
  const a = frame(encode([[1, 1]]))
  const b = frame(encode([[1, 'x'.repeat(200)]]))
  const all = Uint8Array.from([...a, ...b])
  const { frames, rest } = unframe(all.subarray(0, a.length + 5))
  expect(frames.length).toBe(1)
  expect(rest.length).toBe(5)
  expect(unframe(all).frames.length).toBe(2)
})

it('rejects truncated input', () => {
  expect(() => decode(Uint8Array.from([0x0a, 0x05, 0x01]))).toThrow(RangeError)
})
