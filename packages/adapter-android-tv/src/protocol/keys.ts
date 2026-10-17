// The only keys a dr4w client may send (Android KeyEvent codes). Anything else is refused before it
// reaches the TV. Keys that open system settings, change the device or erase data are not here.
export const KEYS = {
  POWER: 26,
  WAKEUP: 224,
  SLEEP: 223,
  HOME: 3,
  BACK: 4,
  MENU: 82,
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  DPAD_CENTER: 23,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  VOLUME_MUTE: 164,
  CHANNEL_UP: 166,
  CHANNEL_DOWN: 167,
  MEDIA_PLAY_PAUSE: 85,
  MEDIA_PLAY: 126,
  MEDIA_PAUSE: 127,
  MEDIA_STOP: 86,
  MEDIA_NEXT: 87,
  MEDIA_PREVIOUS: 88,
  MEDIA_REWIND: 89,
  MEDIA_FAST_FORWARD: 90,
  TV_INPUT: 178,
  TV_INPUT_HDMI_1: 243,
  TV_INPUT_HDMI_2: 244,
  TV_INPUT_HDMI_3: 245,
  TV_INPUT_HDMI_4: 246,
  GUIDE: 172,
  INFO: 165,
  CAPTIONS: 175,
  DIGIT_0: 7,
  DIGIT_1: 8,
  DIGIT_2: 9,
  DIGIT_3: 10,
  DIGIT_4: 11,
  DIGIT_5: 12,
  DIGIT_6: 13,
  DIGIT_7: 14,
  DIGIT_8: 15,
  DIGIT_9: 16,
} as const

export type KeyName = keyof typeof KEYS

/** Second layer: codes that must never be sent even if someone adds them to KEYS by mistake. */
export const BLOCKED_CODES = new Set([
  176, // KEYCODE_SETTINGS: system settings (factory reset lives there)
  284, // KEYCODE_ALL_APPS
  231, // KEYCODE_VOICE_ASSIST (opens a microphone)
  219, // KEYCODE_ASSIST
  84, // KEYCODE_SEARCH (starts voice search on Google TV)
  276, // KEYCODE_SOFT_SLEEP
  241, // KEYCODE_TV_NETWORK (network setup menu)
])

export function keyCode(name: string): number {
  if (!Object.hasOwn(KEYS, name)) throw new Error(`Key "${name}" is not on the allow-list`)
  const code = KEYS[name as KeyName]
  if (BLOCKED_CODES.has(code)) throw new Error(`Key "${name}" is blocked`)
  return code
}
