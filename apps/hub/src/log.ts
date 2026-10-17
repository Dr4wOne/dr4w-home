// One JSON object per line on stdout (journald and docker logs keep it as is).
export function log(level: 'info' | 'error', msg: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, ...data, t: new Date().toISOString() }))
}
