// Live state for the app on any HomeSource: optimistic updates with visible rollback, designed
// confirmation for risky commands, scenes with progress, the command bar, and link status.
import { type HomeSource, HubError, type LinkStatus } from '@dr4w-home/client'
import {
  type Command,
  type CommandResult,
  type Device,
  predict,
  type Scene,
} from '@dr4w-home/device-sdk'
import { type Intent, interpret, palette } from '@dr4w-home/intent'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type Notice = { id: number; text: string; tone: 'info' | 'error' }
export type ConfirmRequest = {
  title: string
  text: string
  action: string
  resolve: (yes: boolean) => void
}

const PENDING_MS = 2000

function failure(d: Device, r: Extract<CommandResult, { ok: false }>): string {
  switch (r.reason) {
    case 'timeout':
      return `${d.name} did not confirm. Showing its last known state.`
    case 'invalidState':
      return r.detail ?? `${d.name} cannot do that right now.`
    case 'unreachable':
      return `${d.name} is offline. Nothing was sent.`
    case 'blocked':
      return `${d.name} does not allow that command.`
    case 'unsupported':
      return `${d.name} cannot do that.`
    default:
      return `${d.name} refused that.`
  }
}

/** What the confirm dialog says before a risky command is repeated with `confirmed: true`. */
function confirmText(d: Device, c: Command): Omit<ConfirmRequest, 'resolve'> {
  if (c.type === 'volume' && c.op === 'set')
    return {
      title: `Set ${d.name} to volume ${c.level}?`,
      text: 'That is loud. Check nobody is asleep nearby.',
      action: `Volume ${c.level}`,
    }
  if (c.type === 'power' && !c.on)
    return {
      title: `Turn ${d.name} off?`,
      text: 'A game is running. Unsaved progress will be lost.',
      action: 'Turn off',
    }
  return {
    title: `Send this to ${d.name}?`,
    text: 'The device asks for a confirmation first.',
    action: 'Send',
  }
}

/** `initial` lets a page render the first state on the server (the showcase), so nothing shifts later. */
export function useHome(source: HomeSource, initial?: { devices: Device[]; scenes: Scene[] }) {
  const [devices, setDevices] = useState<Device[]>(initial?.devices ?? [])
  const [scenes, setScenes] = useState<Scene[]>(initial?.scenes ?? [])
  const [loaded, setLoaded] = useState(Boolean(initial))
  const [link, setLink] = useState<LinkStatus>('live')
  const [simulatedDown, setSimulatedDown] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const [pending, setPending] = useState<Record<string, Device>>({})
  const [sceneRun, setSceneRun] = useState<{ id: string; step: number; of: number }>()
  const [notice, setNotice] = useState<Notice>()
  const [confirm, setConfirm] = useState<ConfirmRequest>()
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const live = useRef({ devices, down: false })
  const down = simulatedDown || link === 'down'
  live.current = { devices, down }

  const say = useCallback(
    (text: string, tone: Notice['tone'] = 'info') => setNotice({ id: Date.now(), text, tone }),
    [],
  )
  const settle = useCallback((id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setPending(({ [id]: _, ...rest }) => rest)
  }, [])

  useEffect(() => {
    let stop = () => {}
    let cancelled = false
    source
      .load()
      .then(({ devices, scenes }) => {
        if (cancelled) return
        setDevices(devices)
        setScenes(scenes)
        setLoaded(true)
        stop = source.subscribe((d) => {
          setDevices((all) =>
            all.some((x) => x.id === d.id) ? all.map((x) => (x.id === d.id ? d : x)) : [...all, d],
          )
          settle(d.id)
        }, setLink)
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof HubError && e.status === 403) setSignedOut(true)
        else setLink('down')
        setLoaded(true)
      })
    return () => {
      cancelled = true
      stop()
    }
  }, [source, settle])

  const ask = useCallback(
    (c: Omit<ConfirmRequest, 'resolve'>) =>
      new Promise<boolean>((resolve) => setConfirm({ ...c, resolve })),
    [],
  )
  const answer = useCallback(
    (yes: boolean) =>
      setConfirm((c) => {
        c?.resolve(yes)
        return undefined
      }),
    [],
  )

  const execute = useCallback(
    async (deviceId: string, command: Command, confirmed = false): Promise<boolean> => {
      const device = live.current.devices.find((d) => d.id === deviceId)
      if (!device) return false
      if (live.current.down) {
        say('The hub is not answering. Nothing was sent.', 'error')
        return false
      }
      setPending((p) => ({ ...p, [deviceId]: predict(p[deviceId] ?? device, command) }))
      let r: CommandResult
      try {
        r = await source.execute(deviceId, command, confirmed)
      } catch (e) {
        if (e instanceof HubError && e.status === 403) setSignedOut(true)
        r = { ok: false, reason: 'unreachable', ms: 0 }
      }
      if (r.ok) {
        // Normally the device's own report clears this; keypad presses may never send one.
        clearTimeout(timers.current.get(deviceId))
        timers.current.set(
          deviceId,
          setTimeout(() => settle(deviceId), PENDING_MS),
        )
        return true
      }
      settle(deviceId) // roll back to what the device last reported
      if (r.reason === 'needsConfirmation' && !confirmed) {
        if (await ask(confirmText(device, command))) return execute(deviceId, command, true)
        return false
      }
      say(failure(device, r), 'error')
      return false
    },
    [source, say, settle, ask],
  )

  const scene = useCallback(
    async (id: string) => {
      const s = scenes.find((x) => x.id === id)
      if (!s) return
      if (live.current.down) return say('The hub is not answering. Nothing was sent.', 'error')
      setSceneRun({ id, step: 0, of: s.steps.length })
      let r: { ok: boolean; failedStep?: number }
      try {
        r = await source.runScene(id, (step, of) => setSceneRun({ id, step, of }))
      } catch {
        r = { ok: false }
      }
      setSceneRun(undefined)
      if (r.ok) say(`${s.name} is set.`)
      else
        say(
          r.failedStep === undefined
            ? `${s.name} did not run.`
            : `${s.name} stopped at step ${r.failedStep + 1} of ${s.steps.length}.`,
          'error',
        )
    },
    [scenes, source, say],
  )

  const shown = useMemo(() => devices.map((d) => pending[d.id] ?? d), [devices, pending])
  const ctx = useMemo(() => ({ devices: shown, scenes }), [shown, scenes])
  const intents = useCallback(
    (text: string): Intent[] => (text.trim() ? interpret(text, ctx) : palette(ctx)),
    [ctx],
  )
  const act = useCallback(
    (i: Intent) =>
      i.action.kind === 'scene'
        ? scene(i.action.sceneId)
        : execute(i.action.deviceId, i.action.command),
    [scene, execute],
  )

  return {
    source,
    loaded,
    devices: shown,
    scenes,
    isPending: (id: string) => id in pending,
    link,
    down,
    signedOut,
    simulateDown: setSimulatedDown,
    execute,
    scene,
    sceneRun,
    intents,
    act,
    notice,
    clearNotice: useCallback(() => setNotice(undefined), []),
    confirm,
    answer,
  }
}

export type Home = ReturnType<typeof useHome>
