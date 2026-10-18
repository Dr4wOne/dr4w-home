# Status

**As of:** 2026-10-17 · Part A done and approved (public repository, live showcase). Part B (Switch 2)
released in #3 and **paused** by the owner; next project: the Daikin air conditioner

## Paused: Switch 2
- Shipped in #3: live controller WebSocket `/api/gamepad/:id` with a 100 ms watchdog and a 5 s silent
  timeout, demo and Bluetooth outputs, `adapter-nintendo-switch`, controller profiles with 4 presets,
  the phone's player and builder, the showcase's virtual screen. The Bluetooth output is a root nxbt
  sidecar, socket-activated: it starts when a phone plays and stops 10 minutes after the last one.
  Guides: `docs/controller.md`, `docs/switch-2.md` (also: how to pause and resume it on the hub).
- **To pick it up again:** branch from `main`, read `docs/switch-2.md`, this file's G5 table and
  `packages/adapter-nintendo-switch/docs/discovery.md`. Next steps, in order: the wired Pico bridge
  (parts ordered; needs Pro Controller Wired Communication on, owner's go), then Switch 1 discovery.

### G5: Switch 2 results (2026-10-17, system 23.0.1, hub on Ubuntu 22.04, BlueZ 5.64)
| Check | Result | Evidence |
|---|---|---|
| Pairing through Change Grip/Order | Pass, a few seconds | Sidecar status `connected` |
| Every button and both sticks | Pass | Owner, on Test Controller Buttons, from the iPhone |
| Latency through the real sidecar | Pass: hub receive to sidecar write p95 0.13 ms (p99 0.21); client send to ack p95 0.75 ms; 1000 of 1000 frames | `pnpm --filter @dr4w-home/hub latency --sidecar …`. Not in it: phone Wi-Fi, the Bluetooth link |
| Release on a dropped connection | Pass | Owner turned the phone's Wi-Fi off while holding a button |
| Reconnect after the console sleeps | Fail: the console refuses (`Connection reset by peer`) | Pair again; the phone says so ("Not paired: …") |
| Start on Play, stop when idle | Pass: started by the hub's connection; stopped 10 min after the hub let go (30 s after the phone), in 0.6 s, and BlueZ came back with its plugins, adapter on, no chip errors | Sidecar, hub and kernel logs |
| Real iPhone: multi-touch, tilt sign and motion permission, click sound, Home Screen full screen | Pass | Owner, on the console |

Branch review done (all findings fixed); released in #3.

## Done
- Packages: `device-sdk` (capabilities incl. `mode`, schemas), `adapter-android-tv` (protocol, supervised
  session, stale-state fix, read-back), `adapter-demo`, `intent`, `client` (demo and hub sources).
- Apps: `hub` (adapter registry, danger rules, API, SSE, scenes, `pnpm hub pair/link`), `web` (PWA,
  capability-generated controls, TV remote), `showcase` (static, live at https://home.dr4w.io, deployed by `deploy-showcase.yml`).
- Privacy: scrubber, CI gate (gitleaks over history, personal-data check), deny-list outside the repo.
- Docs judges: quickstart from a clean clone in 2 min; a fresh agent added a demo fan end to end in
  6.6 min, then 3.6 min after the fixes. Privacy judge: no personal data in files or git metadata; the
  repository was published from one fresh commit.
- Showcase live: Lighthouse mobile 98 / 100 / 93 / 100, LCP 1.8 s, CLS 0.

## Next up
1. Daikin air conditioner: `adapter-daikin`, a simulated AC in the showcase, the owner's unit in the hub.
2. Switch 2 (paused): the wired Pico bridge, then Switch 1 discovery.

## Known issues
- Switch 2 refuses nxbt's reconnect after it sleeps (`Connection reset by peer`, system 23.0.1): pair
  again with Change Grip/Order after waking it. The wired Pico bridge would not have this problem.
- While the controller service runs, the hub computer has no other Bluetooth (nxbt turns BlueZ's plugins
  off). Restarting BlueZ twice within seconds hung the laptop's Intel chip once; the sidecar now spaces
  restarts 10 s apart and says when the adapter does not answer.
- Switch 2 "turn on" stops after the TV is on: the TV adapter blocks `inputSource` (no read-back), so the
  console's input is not selected and "on screen" stays unknown.
- HDMI input switching on the TV is not confirmed: no read-back from the protocol (discovery.md).
- Web app Lighthouse performance is 99 (LCP 1.8 s): the font preload costs a point, and without it the
  app almost never renders in its own typeface.
- TV volume confirmation is slower while the TV plays video: p95 321 ms through the hub (target 150 ms);
  70 ms on the TV's home screen. Phone-to-hub time over the VPN is not measured yet.
- Showcase best practices is 93: Cloudflare Web Analytics injects a beacon that the CSP blocks, which logs a
  console error. Fix: exclude home.dr4w.io from automatic setup in the Cloudflare dashboard.
- The phone controller passed on a real iPhone (Safari, Home Screen app); VoiceOver by ear and 60 fps are open.

## Recent decisions
See [decisions/README.md](decisions/README.md).
