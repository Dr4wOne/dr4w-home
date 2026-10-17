// node scripts/pair.ts <tv-ip> <state-dir> — pair a TV (stand in front of it; takes under a minute).
import { pairTv } from '../src/pair.ts'

const [host, dir] = process.argv.slice(2)
if (!host || !dir) throw new Error('usage: node scripts/pair.ts <tv-ip> <state-dir>')
const r = await pairTv(host, dir)
console.log(`paired in ${r.seconds.toFixed(1)} s${r.mac ? '; MAC saved for Wake-on-LAN' : ''}`)
