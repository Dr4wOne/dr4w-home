# Discovery (Part A, 2026-10-16)

What exists before the kit is built: the TV work, its remote UI, and the landing page whose design
language the showcase and hub should share. Device details here are generic on purpose; the owner's
addresses, identifiers and pairing data stay in the owner's private config.

## The TV work so far

The TV is a Philips-branded Android TV (Android TV OS 11). It has no
JointSPACE API. It is controlled with Google's **Android TV Remote v2** protocol: TLS 1.3 with a client
certificate, pairing on port 6467 with a six-character code shown on the TV, control on port 6466,
length-prefixed protobuf messages. The adapter's protocol notes are in `packages/adapter-android-tv`.

| Capability | How | Verified on the real TV |
|---|---|---|
| Pairing | Code on screen, typed into the CLI | 54.5 s end to end |
| Power state | The TV reports it on connect and on change | Yes |
| Power off | `POWER` key | Off in 2.0 s |
| Power on, session open | `POWER` key | On in 2.8 s |
| Power on, deep standby | Wake-on-LAN magic packet, then reconnect | Port open within 1 s |
| Volume up / down, absolute level | Volume keys, then read back the TV's own volume report | 100 of 100; p50 54 ms, p95 71 ms through the bridge |
| Mute | `VOLUME_MUTE`, read back | Yes |
| Navigation | D-pad, OK, Back, Home | Yes (seen on screen) |
| Current app | The TV reports the foreground package | Yes |
| Open an app | `https://` app links (YouTube, Netflix, Disney+, Prime Video) | YouTube in 1.3 s |
| Input switching (HDMI) | Android key code `TV_INPUT_HDMI_1` (243) | **Not confirmed**: sent once (owner's "go", 2026-10-16); the TV reported no change for 6 s, so the protocol gives no read-back for inputs |
| Picture mode, Ambilight | — | Not available on this TV through this protocol |

A stale-state bug was found the same day: the old bridge reported the TV off while it was on and playing. The hub treats state older than a few seconds as unknown and re-reads before acting.

Refused on purpose: settings, input-source menus, assistant and search keys, `market://` links (they
make the TV drop the session), anything on the Cast setup port. Fault recovery measured: TV IP change
recovered in 19 s; bridge killed and back in 0.86 s.

Code that moves into the kit: `packages/android-tv-remote` (13 tests, replay fixtures), the bridge's
session, command runner and LAN API (`apps/tv/bridge`, 11 tests), the TV contracts, and the remote UI
(`apps/tv/web`, 5 tests).

## Audit: the current TV remote UI

`redesign-existing-projects` on `apps/tv/web` (vanilla CSS, React):

| Area | Finding | Keep or fix |
|---|---|---|
| Accessibility | axe 0 violations, Lighthouse accessibility 100, all targets at least 44 px, no sideways scroll at 360 px | Keep; it is the floor for the kit |
| Layout | One column of controls; scenes and apps as a 2×2 grid; D-pad as a 3×3 grid | Keep the remote; it becomes the TV's device view |
| Hierarchy | Every control is the same grey tile, so the main action (power) and rare ones (Back) weigh the same | Fix: one dominant action per screen |
| State | One status line; no difference between assumed and confirmed state; no rollback shown | Fix: optimistic state with visible confirmation and rollback |
| Surfaces | One box-shadow (the current-app ring; taste-skill lint: 1 FAIL) | Fix: use a fill step instead |
| Feedback | `navigator.vibrate` only, which iOS Safari does not have | Fix: visual press state within one frame, optional sound |
| Missing states | No hub-down state beyond a dot, no empty state, no landscape layout | Fix |
| Typography | System font, one size for almost everything | Fix |

The taste-skill inspector's FAILs on this page (no pictures, no motion, no button on the signed-out
screen) are landing-page rules and do not apply to an app screen, except the motion floor, which the
new hub meets with press and state motion.

## Audit: the landing page (dr4w.io)

Run on the live site and its source (`dr4w-landpage`, Vite + React + Tailwind 3).

**Its design language**

| Element | Value |
|---|---|
| Ground | `#0A0A0F` (near-black with a blue cast); surfaces `#111118`, `#1A1A26` |
| Ink | `#F0F0FF`; muted `#8888AA`; dim `#4A4A6A` |
| Accents | violet `#6C63FF` (primary actions), cyan `#00D9FF` (highlights), orange `#FF6B35` (rare) |
| Type | Space Grotesk (display), Inter (text), JetBrains Mono (labels) — loaded from Google Fonts at runtime |
| Motif | A robot illustration with red eyes; the `dr4w.io` wordmark with a coloured dot |
| Motion | framer-motion fade-ups on scroll; a typing effect |
| Tone | Personal, confident, technical; short sentences |

**Gate result:** `inspect.mjs` 13 FAIL, 7 WARN; `lint.mjs` 92 FAIL, 35 WARN. The main ones: 2.3:1
contrast on dim text, 14 px body text, 65 text blocks under 13 px, two rows of icon-topped cards,
29 backdrop-blur surfaces, three typefaces, ten font sizes, grid lines, monospace labels, gradient text.

**What the family shares, and what it leaves behind**

| Carry over | Leave behind |
|---|---|
| The near-black blue-cast ground `#0A0A0F` in dark mode | Glass cards and backdrop blur |
| Space Grotesk as the display face (self-hosted, subset) | Inter and the monospace labels |
| Cyan as the "on / live" colour; violet only for the dr4w.io wordmark dot | Violet buttons and violet-to-cyan gradient text |
| The `dr4w.io` wordmark and its dot | The robot illustration (it is the landing page's own) |
| Short, direct copy in the first person | Grid-line backgrounds, pill badges, icon cards |

## What the iPhone allows (October 2026)

From `docs/https-on-lan.md`: no Web Bluetooth, WebHID or `navigator.vibrate` in iOS Safari; DeviceMotion
needs `DeviceMotionEvent.requestPermission()` from a tap, over HTTPS; Web Push works for Home Screen apps;
same-document View Transitions work since Safari 18; a service worker needs a secure context, so a plain
`http://192.168…` address cannot be installed as a proper app.
