# Status

**As of:** 2026-10-17 · Part A done pending approval: the repository is public and the showcase is live (G3 passed)

## In progress
- Part B, Switch 2 (branch `build/switch2`): live controller WebSocket `/api/gamepad/:id` with a
  watchdog, demo and Bluetooth (nxbt sidecar) outputs, `adapter-nintendo-switch`, controller profiles
  API with built-in presets, latency judge (demo output: p95 about 1 ms send to ack); the phone's
  player, builder and the showcase's virtual screen (guide: `docs/controller.md`). Open: install the
  root sidecar and test on the console; checks on a real iPhone (multi-touch feel, tilt sign and
  permission, click sound unlock, Home Screen full screen).

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
1. Part B: Nintendo Switch and Switch 2 (discovery first, gate G4).

## Known issues
- Switch 2 "turn on" stops after the TV is on: the TV adapter blocks `inputSource` (no read-back), so the
  console's input is not selected and "on screen" stays unknown.
- HDMI input switching on the TV is not confirmed: no read-back from the protocol (discovery.md).
- Web app Lighthouse performance is 99 (LCP 1.8 s): the font preload costs a point, and without it the
  app almost never renders in its own typeface.
- TV volume confirmation is slower while the TV plays video: p95 321 ms through the hub (target 150 ms);
  70 ms on the TV's home screen. Phone-to-hub time over the VPN is not measured yet.
- Showcase best practices is 93: Cloudflare Web Analytics injects a beacon that the CSP blocks, which logs a
  console error. Fix: exclude home.dr4w.io from automatic setup in the Cloudflare dashboard.
- Only tested in Chromium at iPhone sizes; real Safari, VoiceOver by ear and 60 fps are open.

## Recent decisions
See [decisions/README.md](decisions/README.md).
