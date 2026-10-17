// Pairing on port 6467 (Google "Polo" pairing protocol, version 2). The TV shows a 6-character hex
// code; the client proves it saw the code by hashing both RSA public keys with it.
import { createHash, createPublicKey, type X509Certificate } from 'node:crypto'
import { connect, type TLSSocket } from 'node:tls'
import type { Identity } from './certs.ts'
import { type Decoded, decode, encode, type Field, frame, msg, num, str, unframe } from './proto.ts'

export const PAIRING_PORT = 6467
const STATUS_OK = 200
const ENCODING_HEXADECIMAL = 3
const ROLE_INPUT = 1
const statusNames: Record<number, string> = {
  400: 'error',
  401: 'bad configuration',
  402: 'bad secret (wrong code)',
}

/** RSA modulus and exponent as unsigned big-endian bytes (what the TV hashes). */
function rsaParts(pem: string | Buffer): { n: Buffer; e: Buffer } {
  const jwk = createPublicKey(pem).export({ format: 'jwk' }) as { n: string; e: string }
  return { n: Buffer.from(jwk.n, 'base64url'), e: Buffer.from(jwk.e, 'base64url') }
}

/**
 * The pairing secret: SHA-256(client n, client e, server n, server e, code[2:]).
 * The first byte of the hash must equal code[0:2]; that is how a mistyped code is caught locally.
 */
export function pairingSecret(
  clientCert: string | Buffer,
  serverCert: string | Buffer,
  code: string,
): Buffer {
  if (!/^[0-9a-fA-F]{6}$/.test(code))
    throw new Error('The code on the TV is 6 characters, 0–9 and A–F')
  const c = rsaParts(clientCert)
  const s = rsaParts(serverCert)
  const hash = createHash('sha256')
    .update(c.n)
    .update(c.e)
    .update(s.n)
    .update(s.e)
    .update(Buffer.from(code.slice(2), 'hex'))
    .digest()
  if (hash[0] !== Number.parseInt(code.slice(0, 2), 16))
    throw new Error('That code does not match this TV; check it and try again')
  return hash
}

function outer(fields: Field[]): Uint8Array {
  return frame(encode([[1, 2], [2, STATUS_OK], ...fields]))
}

class FrameReader {
  #rest = new Uint8Array()
  #queue: Decoded[] = []
  #waiting: ((d: Decoded) => void)[] = []
  #fail?: (e: Error) => void
  constructor(socket: TLSSocket) {
    socket.on('data', (chunk: Buffer) => {
      const { frames, rest } = unframe(Uint8Array.from([...this.#rest, ...chunk]))
      this.#rest = Uint8Array.from(rest)
      for (const f of frames) {
        const d = decode(f)
        const w = this.#waiting.shift()
        if (w) w(d)
        else this.#queue.push(d)
      }
    })
    const fail = (e: Error) => this.#fail?.(e)
    socket.on('error', fail)
    socket.on('close', () => fail(new Error('The TV closed the pairing connection')))
  }
  next(timeoutMs: number): Promise<Decoded> {
    const queued = this.#queue.shift()
    if (queued) return Promise.resolve(queued)
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timed out waiting for the TV')), timeoutMs)
      this.#fail = (e) => {
        clearTimeout(t)
        reject(e)
      }
      this.#waiting.push((d) => {
        clearTimeout(t)
        resolve(d)
      })
    })
  }
}

function expectOk(d: Decoded, step: string) {
  const status = num(d, 2)
  if (status !== STATUS_OK)
    throw new Error(`Pairing failed at ${step}: ${statusNames[status ?? 0] ?? `status ${status}`}`)
}

export interface PairResult {
  serverCert: string // the TV's certificate (PEM), pinned for every later connection
  serverName?: string
}

/**
 * Pairs `identity` with the TV at `host`. Calls `getCode()` once the TV shows its code
 * (it may prompt a person); resolves when the TV accepts the secret.
 */
export async function pair(opts: {
  host: string
  identity: Identity
  clientName: string
  getCode: () => Promise<string>
  timeoutMs?: number
  log?: (event: string) => void
}): Promise<PairResult> {
  const { host, identity, clientName, getCode, timeoutMs = 10_000, log = () => {} } = opts
  const socket = connect({
    host,
    port: PAIRING_PORT,
    key: identity.key,
    cert: identity.cert,
    rejectUnauthorized: false,
  })
  await new Promise<void>((res, rej) => socket.once('secureConnect', res).once('error', rej))
  const reader = new FrameReader(socket)
  try {
    const peer = socket.getPeerX509Certificate() as X509Certificate | undefined
    if (!peer) throw new Error('The TV presented no certificate')
    const serverCert = peer.toString()
    log('connected')

    socket.write(
      outer([
        [
          10,
          [
            [1, 'atvremote'],
            [2, clientName],
          ],
        ],
      ]),
    ) // PairingRequest
    const ack = await reader.next(timeoutMs)
    expectOk(ack, 'request')
    const serverName = str(msg(ack, 11) ?? new Map(), 1)
    log('request accepted')

    const encoding: Field[] = [
      [1, ENCODING_HEXADECIMAL],
      [2, 6],
    ]
    socket.write(
      outer([
        [
          20,
          [
            [1, encoding],
            [3, ROLE_INPUT],
          ],
        ],
      ]),
    ) // Options: we input a hex code
    expectOk(await reader.next(timeoutMs), 'options')
    socket.write(
      outer([
        [
          30,
          [
            [1, encoding],
            [2, ROLE_INPUT],
          ],
        ],
      ]),
    ) // Configuration
    expectOk(await reader.next(timeoutMs), 'configuration')
    log('code shown on the TV')

    const secret = pairingSecret(identity.cert, serverCert, (await getCode()).trim())
    socket.write(outer([[40, [[1, secret]]]])) // Secret
    expectOk(await reader.next(timeoutMs), 'secret')
    log('paired')
    return { serverCert, ...(serverName ? { serverName } : {}) }
  } finally {
    socket.end()
  }
}
