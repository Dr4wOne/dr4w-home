# Status

**As of:** 2026-10-17 · Part A: the owner's hub runs at home and over the VPN (G2 passed); next is G3, going public

## In progress
- G3: publish this repository and deploy the showcase to home.dr4w.io.

## Done
- Packages: `device-sdk` (capabilities incl. `mode`, schemas), `adapter-android-tv` (protocol, supervised
  session, stale-state fix, read-back), `adapter-demo`, `intent`, `client` (demo and hub sources).
- Apps: `hub` (adapter registry, danger rules, API, SSE, scenes, `pnpm hub pair/link`), `web` (PWA,
  capability-generated controls, TV remote), `showcase` (static, not deployed).
- Privacy: scrubber, CI gate (gitleaks over history, personal-data check), deny-list outside the repo.
- Docs judges: quickstart from a clean clone in 2 min; a fresh agent added a demo fan end to end in
  6.6 min, then 3.6 min after the fixes. Privacy judge: no personal data in files; git metadata to be
  replaced at G3.

## Next up
1. G3: make the repository public, turn on private vulnerability reporting, deploy the showcase.
2. Part B: Nintendo Switch and Switch 2 (discovery first, gate G4).

## Known issues
- HDMI input switching on the TV is not confirmed: no read-back from the protocol (discovery.md).
- Web app Lighthouse performance is 99 (LCP 1.8 s): the font preload costs a point, and without it the
  app almost never renders in its own typeface.
- TV volume confirmation is slower while the TV plays video: p95 321 ms through the hub (target 150 ms);
  70 ms on the TV's home screen. Phone-to-hub time over the VPN is not measured yet.
- Only tested in Chromium at iPhone sizes; real Safari, VoiceOver by ear and 60 fps are open.

## Recent decisions
See [decisions/README.md](decisions/README.md).
