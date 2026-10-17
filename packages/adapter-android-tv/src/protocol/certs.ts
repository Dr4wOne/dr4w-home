// The client identity the TV pairs with: an RSA-2048 key and a self-signed certificate.
// Stored only on the bridge (directory 0700, files 0600). Never logged, never sent anywhere but the TV.
import 'reflect-metadata' // required by @peculiar/x509
import { webcrypto } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as x509 from '@peculiar/x509'

export interface Identity {
  key: string // PKCS#8 PEM
  cert: string // X.509 PEM
}

x509.cryptoProvider.set(webcrypto as unknown as Parameters<typeof x509.cryptoProvider.set>[0])

export async function createIdentity(commonName = 'dr4w-bridge'): Promise<Identity> {
  const alg = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-256',
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2048,
  }
  const keys = await webcrypto.subtle.generateKey(alg, true, ['sign', 'verify'])
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: Buffer.from(webcrypto.getRandomValues(new Uint8Array(8))).toString('hex'),
    name: `CN=${commonName}`,
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 20 * 365 * 86_400_000),
    keys,
    signingAlgorithm: alg,
  })
  const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey)).toString(
    'base64',
  )
  const key = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----\n`
  return { key, cert: cert.toString('pem') }
}

/** Loads the identity from `dir`, creating it on first use. */
export async function loadIdentity(dir: string): Promise<Identity> {
  const keyFile = join(dir, 'client-key.pem')
  const certFile = join(dir, 'client-cert.pem')
  if (existsSync(keyFile) && existsSync(certFile)) {
    return { key: readFileSync(keyFile, 'utf8'), cert: readFileSync(certFile, 'utf8') }
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  const id = await createIdentity()
  writeFileSync(keyFile, id.key, { mode: 0o600 })
  writeFileSync(certFile, id.cert, { mode: 0o600 })
  return id
}
