// Minimal protobuf wire-format codec: just what Android TV Remote v2 needs (varints, nested
// messages, strings, bytes). Fields are written in the order given; unknown fields are kept on decode.

export type Value = number | boolean | string | Uint8Array | Field[]
export type Field = [number, Value] // [field number, value]

function varint(n: number): number[] {
  const out: number[] = []
  let v = BigInt.asUintN(64, BigInt(n))
  do {
    let b = Number(v & 0x7fn)
    v >>= 7n
    if (v) b |= 0x80
    out.push(b)
  } while (v)
  return out
}

export function encode(fields: Field[]): Uint8Array {
  const out: number[] = []
  for (const [no, value] of fields) {
    if (typeof value === 'number' || typeof value === 'boolean') {
      out.push(...varint(no << 3), ...varint(Number(value)))
      continue
    }
    const bytes =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : value instanceof Uint8Array
          ? value
          : encode(value)
    out.push(...varint((no << 3) | 2), ...varint(bytes.length), ...bytes)
  }
  return Uint8Array.from(out)
}

/** Generic decode: field number → values in order (varints as numbers, length-delimited as bytes). */
export type Decoded = Map<number, (number | Uint8Array)[]>

export function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0n
  let shift = 0n
  for (;;) {
    if (pos >= buf.length) throw new RangeError('truncated varint')
    const b = buf[pos++] as number
    result |= BigInt(b & 0x7f) << shift
    if (!(b & 0x80)) break
    shift += 7n
    if (shift > 63n) throw new RangeError('varint too long')
  }
  return [Number(BigInt.asIntN(64, result)), pos]
}

export function decode(buf: Uint8Array): Decoded {
  const out: Decoded = new Map()
  let pos = 0
  while (pos < buf.length) {
    const [key, p1] = readVarint(buf, pos)
    pos = p1
    const no = key >>> 3
    const wire = key & 7
    let value: number | Uint8Array
    if (wire === 0) [value, pos] = readVarint(buf, pos)
    else if (wire === 2) {
      const [len, p2] = readVarint(buf, pos)
      if (p2 + len > buf.length) throw new RangeError('truncated field')
      value = buf.subarray(p2, p2 + len)
      pos = p2 + len
    } else if (wire === 5) {
      value = new DataView(buf.buffer, buf.byteOffset + pos, 4).getUint32(0, true)
      pos += 4
    } else if (wire === 1) {
      value = Number(new DataView(buf.buffer, buf.byteOffset + pos, 8).getBigUint64(0, true))
      pos += 8
    } else throw new RangeError(`unsupported wire type ${wire}`)
    out.set(no, [...(out.get(no) ?? []), value])
  }
  return out
}

export const str = (d: Decoded, no: number) => {
  const v = d.get(no)?.[0]
  return v instanceof Uint8Array ? new TextDecoder().decode(v) : undefined
}
export const num = (d: Decoded, no: number) => {
  const v = d.get(no)?.[0]
  return typeof v === 'number' ? v : undefined
}
export const msg = (d: Decoded, no: number) => {
  const v = d.get(no)?.[0]
  return v instanceof Uint8Array ? decode(v) : undefined
}

/** Messages on both ports are prefixed with their length as a varint. */
export function frame(body: Uint8Array): Uint8Array {
  return Uint8Array.from([...varint(body.length), ...body])
}

/** Splits a byte stream into complete frames; returns the frames and the unconsumed rest. */
export function unframe(buf: Uint8Array): { frames: Uint8Array[]; rest: Uint8Array } {
  const frames: Uint8Array[] = []
  let pos = 0
  while (pos < buf.length) {
    let len: number
    let start: number
    try {
      ;[len, start] = readVarint(buf, pos)
    } catch {
      break // length itself not complete yet
    }
    if (start + len > buf.length) break
    frames.push(buf.subarray(start, start + len))
    pos = start + len
  }
  return { frames, rest: buf.subarray(pos) }
}
