// Built-in controller layouts, shared by the hub (read-only profiles) and the web builder. Landscape
// fractions: x and y are the control's centre, size its diameter as a fraction of the screen height.
import type { Control, ControllerProfile } from './gamepad.ts'

const c = (
  id: string,
  kind: Control['kind'],
  binds: Control['binds'],
  x: number,
  y: number,
  size: number,
  label?: string,
): Control => ({ id, kind, binds, x, y, size, opacity: 0.85, ...(label ? { label } : {}) })

export const PRESETS: readonly ControllerProfile[] = [
  {
    id: 'pro-controller',
    name: 'Pro Controller',
    controls: [
      c('zl', 'shoulder', 'zl', 0.07, 0.08, 0.12, 'ZL'),
      c('l', 'shoulder', 'l', 0.2, 0.08, 0.12, 'L'),
      c('r', 'shoulder', 'r', 0.8, 0.08, 0.12, 'R'),
      c('zr', 'shoulder', 'zr', 0.93, 0.08, 0.12, 'ZR'),
      c('left-stick', 'stick', 'left', 0.17, 0.42, 0.3),
      c('dpad', 'dpad', 'dpad', 0.32, 0.76, 0.3),
      c('x', 'button', 'x', 0.86, 0.32, 0.13, 'X'),
      c('y', 'button', 'y', 0.79, 0.48, 0.13, 'Y'),
      c('a', 'button', 'a', 0.93, 0.48, 0.13, 'A'),
      c('b', 'button', 'b', 0.86, 0.64, 0.13, 'B'),
      c('right-stick', 'stick', 'right', 0.68, 0.76, 0.28),
      c('minus', 'button', 'minus', 0.42, 0.1, 0.08, '−'),
      c('plus', 'button', 'plus', 0.58, 0.1, 0.08, '+'),
      c('capture', 'button', 'capture', 0.42, 0.28, 0.08, 'Capture'),
      c('home', 'button', 'home', 0.58, 0.28, 0.08, 'Home'),
      c('l-click', 'button', 'lStick', 0.44, 0.9, 0.08, 'LS'),
      c('r-click', 'button', 'rStick', 0.56, 0.9, 0.08, 'RS'),
    ],
  },
  {
    id: 'mario-kart',
    name: 'Mario Kart',
    controls: [
      c('l', 'shoulder', 'l', 0.12, 0.1, 0.16, 'Item'),
      c('r', 'shoulder', 'r', 0.88, 0.1, 0.16, 'Drift'),
      c('left-stick', 'stick', 'left', 0.2, 0.6, 0.36),
      c('a', 'button', 'a', 0.86, 0.58, 0.24, 'Accelerate'),
      c('b', 'button', 'b', 0.7, 0.8, 0.18, 'Brake'),
      c('plus', 'button', 'plus', 0.5, 0.1, 0.08, '+'),
    ],
    tilt: { stick: 'left', axis: 'x', maxDeg: 30 },
  },
  {
    id: 'party',
    name: 'Party',
    controls: [
      c('left-stick', 'stick', 'left', 0.22, 0.55, 0.4),
      c('a', 'button', 'a', 0.82, 0.42, 0.26, 'A'),
      c('b', 'button', 'b', 0.68, 0.72, 0.22, 'B'),
      c('plus', 'button', 'plus', 0.5, 0.12, 0.1, '+'),
    ],
  },
  {
    id: 'one-handed-right',
    name: 'One-handed (right)',
    controls: [
      c('r', 'shoulder', 'r', 0.6, 0.1, 0.12, 'R'),
      c('zr', 'shoulder', 'zr', 0.72, 0.08, 0.12, 'ZR'),
      c('x', 'button', 'x', 0.92, 0.1, 0.12, 'X'),
      c('b', 'button', 'b', 0.84, 0.24, 0.13, 'B'),
      c('a', 'button', 'a', 0.92, 0.4, 0.13, 'A'),
      c('y', 'button', 'y', 0.76, 0.42, 0.13, 'Y'),
      c('plus', 'button', 'plus', 0.5, 0.32, 0.09, '+'),
      c('left-stick', 'stick', 'left', 0.7, 0.68, 0.32),
    ],
  },
]
