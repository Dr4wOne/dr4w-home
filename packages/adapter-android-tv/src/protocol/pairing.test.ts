import { expect, it } from 'vitest'
import { createIdentity } from './certs.ts'
import { pairingSecret } from './pairing.ts'

it('accepts exactly one prefix for a given code suffix, and rejects bad input', async () => {
  const [client, tv] = await Promise.all([createIdentity('client'), createIdentity('tv')])
  const accepted: string[] = []
  for (let b = 0; b < 256; b++) {
    const code = `${b.toString(16).padStart(2, '0')}abcd`
    try {
      const secret = pairingSecret(client.cert, tv.cert, code)
      expect(secret.length).toBe(32)
      expect(secret[0]).toBe(b)
      accepted.push(code)
    } catch {}
  }
  expect(accepted).toHaveLength(1)
  expect(() => pairingSecret(client.cert, tv.cert, 'xyz123')).toThrow(/6 characters/)
}, 20_000)
