// Wake-on-LAN: the TV leaves the network about a minute into standby; a magic packet to its
// Wi-Fi MAC brings it back and switches it on (confirmed 2026-10-16).
import { createSocket } from 'node:dgram'

export function magicPacket(mac: string): Buffer {
  const hex = mac.replace(/[:-]/g, '')
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) throw new Error(`Not a MAC address: ${mac}`)
  const m = Buffer.from(hex, 'hex')
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => m)])
}

export function sendWakeOnLan(mac: string, broadcast = '255.255.255.255'): Promise<void> {
  const pkt = magicPacket(mac)
  return new Promise((resolve, reject) => {
    const s = createSocket('udp4')
    s.once('error', reject)
    s.bind(() => {
      s.setBroadcast(true)
      s.send(pkt, 9, broadcast, (err) => {
        s.close()
        if (err) reject(err)
        else resolve()
      })
    })
  })
}
