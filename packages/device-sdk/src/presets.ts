// Ready-made controller layouts: the builder starts from one of these, and the player opens with the
// first one until the person saves their own. Positions: the control's centre, as fractions of the
// landscape screen's width (x) and height (y). Size: the control's diameter as a fraction of the
// screen height, so a round button stays round on every phone.
import type { Control, ControllerProfile } from './gamepad.ts'

const c = (
  id: string,
  kind: Control['kind'],
  binds: Control['binds'],
  x: number,
  y: number,
  size: number,
  label?: string,
): Control => ({ id, kind, binds, x, y, size, opacity: 0.9, ...(label ? { label } : {}) })

const abxy = (x: number, y: number, dx: number, dy: number, size: number): Control[] => [
  c('a', 'button', 'a', x + dx, y, size),
  c('b', 'button', 'b', x, y + dy, size),
  c('x', 'button', 'x', x, y - dy, size),
  c('y', 'button', 'y', x - dx, y, size),
]

export const CONTROLLER_PRESETS: ControllerProfile[] = [
  {
    id: 'pro-controller',
    name: 'Pro Controller',
    controls: [
      c('l', 'shoulder', 'l', 0.1, 0.1, 0.14),
      c('zl', 'shoulder', 'zl', 0.25, 0.1, 0.14),
      c('r', 'shoulder', 'r', 0.9, 0.1, 0.14),
      c('zr', 'shoulder', 'zr', 0.75, 0.1, 0.14),
      c('minus', 'button', 'minus', 0.42, 0.14, 0.1),
      c('plus', 'button', 'plus', 0.58, 0.14, 0.1),
      c('capture', 'button', 'capture', 0.45, 0.88, 0.09),
      c('home', 'button', 'home', 0.55, 0.88, 0.09),
      c('left', 'stick', 'left', 0.16, 0.46, 0.34),
      c('dpad', 'dpad', 'dpad', 0.33, 0.76, 0.3),
      c('right', 'stick', 'right', 0.66, 0.74, 0.28),
      ...abxy(0.85, 0.45, 0.07, 0.15, 0.13),
    ],
  },
  {
    id: 'mario-kart',
    name: 'Mario Kart',
    controls: [
      c('l', 'shoulder', 'l', 0.12, 0.16, 0.2, 'Item'),
      c('r', 'shoulder', 'r', 0.88, 0.16, 0.2, 'Drift'),
      c('plus', 'button', 'plus', 0.5, 0.12, 0.1),
      c('left', 'stick', 'left', 0.16, 0.66, 0.34),
      c('b', 'button', 'b', 0.7, 0.78, 0.2, 'Brake'),
      c('a', 'button', 'a', 0.88, 0.62, 0.3, 'Go'),
    ],
    tilt: { stick: 'left', axis: 'x', maxDeg: 30 },
  },
  {
    id: 'party',
    name: 'Party',
    controls: [
      c('plus', 'button', 'plus', 0.5, 0.12, 0.12),
      c('left', 'stick', 'left', 0.2, 0.56, 0.5),
      c('b', 'button', 'b', 0.66, 0.74, 0.24),
      c('a', 'button', 'a', 0.84, 0.46, 0.32),
    ],
  },
  {
    id: 'one-handed-right',
    name: 'One-handed (right)',
    controls: [
      c('r', 'shoulder', 'r', 0.62, 0.12, 0.14),
      c('zr', 'shoulder', 'zr', 0.78, 0.1, 0.14),
      c('plus', 'button', 'plus', 0.95, 0.1, 0.09),
      c('left', 'stick', 'left', 0.6, 0.62, 0.32),
      ...abxy(0.85, 0.52, 0.07, 0.24, 0.14),
    ],
  },
]
