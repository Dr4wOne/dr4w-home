// Test kit: a fake TV connection that behaves like the real one (state pushed after each key,
// pings refresh lastFrameAt). Use it to test anything built on AndroidTvAdapter without a TV.
import { EventEmitter } from 'node:events'
import type { TvState } from './protocol/index.ts'
import type { Remote } from './session.ts'

export class FakeRemote extends EventEmitter implements Remote {
  state: TvState = {
    power: true,
    volume: { level: 18, max: 100, muted: false },
    app: 'com.google.android.apps.tv.launcherx',
  }
  lastFrameAt = 0
  sent: string[] = []
  connected = false
  reachable = true

  constructor(state?: Partial<TvState>) {
    super()
    if (state) this.state = { ...this.state, ...state }
  }
  async connect() {
    if (!this.reachable) throw new Error('No answer from the TV')
    this.connected = true
    this.lastFrameAt = Date.now()
  }
  /** The TV pushes a state change (also counts as a frame). */
  push(patch: Partial<TvState>) {
    setTimeout(() => {
      this.state = { ...this.state, ...patch }
      this.lastFrameAt = Date.now()
      this.emit('state')
    }, 5)
  }
  sendKey(name: string) {
    this.sent.push(name)
    const v = this.state.volume ?? { level: 0, max: 100, muted: false }
    if (name === 'VOLUME_UP') this.push({ volume: { ...v, level: Math.min(v.max, v.level + 1) } })
    if (name === 'VOLUME_DOWN') this.push({ volume: { ...v, level: Math.max(0, v.level - 1) } })
    if (name === 'VOLUME_MUTE') this.push({ volume: { ...v, muted: !v.muted } })
    if (name === 'POWER') this.push({ power: !this.state.power })
    if (name === 'HOME') this.push({ app: 'com.google.android.apps.tv.launcherx' })
  }
  launchAppLink(link: string) {
    this.sent.push(link)
    const apps: Record<string, string> = {
      'https://www.youtube.com': 'com.google.android.youtube.tv',
      'https://www.netflix.com/browse': 'com.netflix.ninja',
    }
    if (apps[link]) this.push({ app: apps[link] })
  }
  waitFor(test: (s: TvState) => boolean, ms = 1000) {
    if (test(this.state)) return Promise.resolve(this.state)
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.off('state', on)
        reject(new Error('The TV did not report the expected state in time'))
      }, ms)
      const on = () => {
        if (!test(this.state)) return
        clearTimeout(t)
        this.off('state', on)
        resolve(this.state)
      }
      this.on('state', on)
    })
  }
  close() {
    if (!this.connected) return
    this.connected = false
    this.emit('close')
  }
}
