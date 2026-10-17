# Ambition

Written before building, as the job brief asks. It answers four questions, then lists what changed in
the plan because of the answers.

## 1. What would a top professional do here that nobody asked for?

- **Product designer.** Design for the first ten seconds of three people: the owner on the sofa at
  night, a guest who has never seen the hub, and a developer on GitHub deciding whether to clone it.
  Each gets one obvious first action: "turn the TV on", "say movie night", "try it in your browser".
- **IoT architect.** Treat every device as unreliable and every reported state as a claim to check.
  Each capability carries whether its value was *confirmed* by the device or only *assumed* by us
  (Home Assistant's `assumed_state`, Matter's attribute reports), and the UI shows the difference.
  The hub must survive the device rebooting, changing IP address and refusing commands, and say so.
- **Interaction designer.** The phone has no vibration API in Safari, so press feedback must be visual
  and audible and arrive within one frame (16 ms), before the network answers. Optimistic updates
  roll back visibly when the device disagrees.
- **Open-source maintainer.** The README's first screen decides adoption: what it is, a moving picture
  of it working, a three-command quickstart that works without hardware. A compatibility table that is
  honest about what was verified on real hardware and what was not.
- **Privacy engineer.** Assume the repository and the showcase will be read by someone trying to locate
  the author's home. Nothing personal is ever written into the repo, so nothing has to be removed later;
  a scrubber and a CI gate catch mistakes, and a fresh reviewer tries to break it.
- **Accessibility auditor.** Every control works with VoiceOver, with large text (Dynamic Type at
  200 %), with one thumb, and without colour. State is announced, not only shown.
- **Game-controller engineer (Part B).** Input latency is measured end to end, stuck buttons are a
  safety bug, and release-on-disconnect is tested, not assumed.

## 2. What is the rawest material to start from?

- **Recorded device traffic,** not documentation: the replay fixtures already captured from the real
  TV (`handshake-observe.json`, `capabilities.json`, `latency-lan.json`), scrubbed before they enter
  this repo. The demo devices replay their timings (volume read-back in about 54 ms, power-on in
  about 2.8 s), so the showcase feels like the real thing because it is built from it.
- **The standards' own models:** the Matter device-type and cluster specification and the Home
  Assistant entity model, as the raw material for the capability model (`docs/capability-model.md`).
- **The real phone:** an iPhone in Safari as a Home Screen app is the primary client. Its limits
  (no Web Bluetooth, WebHID or vibration; HTTPS required for a service worker) shape the architecture.
- **A real room, not a dashboard:** the showcase simulates a typical living room (a TV, two consoles
  and a lamp) so visitors see the kit doing the job it was built for.

## 3. Which methods and tools would they use?

| Concern | Method or tool |
|---|---|
| Device truth | Read-back after every command; replay tests from recorded sessions; a real-device harness |
| Capability model | Matter clusters and Home Assistant features as the reference, mapped column by column |
| Design | taste-skill: `design-taste-frontend` for the showcase (a public page), `minimalist-ui` and `redesign-existing-projects` for the hub screens (app screens, which `design-taste-frontend` excludes) |
| Quality | Lighthouse CI, axe, Playwright screenshots at iPhone sizes, the taste-skill Gate (`lint.mjs`, `inspect.mjs`) |
| Privacy | A scrubber with consistent fake values; gitleaks; a custom check for private IP ranges, MAC addresses and a deny-list kept outside the repo |
| Docs | Fresh subagents with no context follow the docs; every point where they get stuck is a doc bug |
| Secure LAN | Tailscale with `tailscale serve` (a real certificate on a private name, and the VPN for remote access in one tool), see `docs/https-on-lan.md` |

## 4. What, other than us, proves the result is right?

- The TV, by reporting its state back after each command.
- Lighthouse, axe and the taste-skill inspector, run in CI and locally.
- A Playwright run on an iPhone-sized viewport, and timings on the real phone.
- A secret scanner and the privacy gate, plus a fresh privacy reviewer.
- Two fresh subagents: one adds a "demo fan" device from the docs alone, one runs the quickstart from a
  clean clone.
- Part B: the Switch's own controller test screens.

## What changed in the plan

| Brief said | Changed to | Why |
|---|---|---|
| Move `packages/philips-tv` into `adapter-philips-tv` | Move `packages/android-tv-remote` into `adapter-android-tv` ("Works with Android TV and Google TV", tested on a Philips TV) | The TV is a Philips-branded Android TV. It has no JointSPACE API (ports 1925 and 1926 are closed); it is controlled with Google's Android TV Remote v2 protocol, which works on any Android TV. Naming the adapter after the protocol makes it useful to far more people |
| "Movie night": TV on, HDMI 1, picture mode, Ambilight, volume 18 | TV on, input, volume 18; picture mode and Ambilight removed from the TV scenes | This TV has no Ambilight. Picture mode is not reachable through the remote protocol without opening menus. Input switching by Android key code was tried once and gave no read-back, so scenes do not rely on it |
| Retire the TV cloud relay and `tv.dr4w.io` at G2 | Nothing to retire; only a redirect from `tv.dr4w.io` if you want one | The cloud relay was planned but never built; `tv.dr4w.io` has no DNS record today |
| taste-skill dials `DESIGN_VARIANCE` 5, `MOTION_INTENSITY` 5, `VISUAL_DENSITY` 4 and its "pre-flight" | Dials recorded as intent; the Gate (`lint.mjs` + `inspect.mjs`) is the pre-flight | The current `design-taste-frontend` (v2) has no dials or pre-flight; it deals directions with `draw.mjs` and checks pages with its Gate. The dials belong to the old experimental version. The brief says to trust the repo |
| `design-taste-frontend` for showcase and hub | `design-taste-frontend` for the showcase only; hub screens follow its house rules plus `minimalist-ui` | The skill says it is "not for dashboards or app screens" |
| Easy setup: Docker Compose or `npx` | Docker Compose as the main path, plus `pnpm` from a clone | The Android TV protocol needs the hub on the home network with Wake-on-LAN broadcasts and mDNS; Compose with `network_mode: host` does that on Linux. Evidence and the macOS caveat are in `docs/https-on-lan.md` and the quickstart |
| REA "already set up" | Workspace present, CLI not installed | Not needed for Part A: the TV protocol is already mapped. Installed when Part B needs it |
