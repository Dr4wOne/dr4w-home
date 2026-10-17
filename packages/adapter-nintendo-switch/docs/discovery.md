# Discovery: Nintendo Switch 2 (Part B, B1, draft of 2026-10-17)

The Switch 2 has no public LAN control API. This page collects what is known from published
evidence before anything is tried on a console. Every row says how sure it is:
**S2-verified** (a primary source tested it on Switch 2), **reported** (community claim), or
**unknown**. Rows move to "verified here" only after a test on the owner's console, recorded below.
The Switch 1 gets its own page later: Switch 2 results are not assumed to hold for it, or the reverse.

## Rules for this adapter
- No console hacking, custom firmware, homebrew, piracy, or bypassing Nintendo security.
- Only official user-facing features and standard accessory interfaces.
- Macros and turbo only for offline single-player, clearly labelled.
- No automation of the Nintendo account (the Nintendo Switch app and the parental controls app are off-limits).
- Nothing is bought, paired or enabled on a console without the owner's "go".

## What the evidence says

| Question | Answer | Confidence | Source |
|---|---|---|---|
| Wired controllers over USB | A Pro Controller works wired in the dock's side USB-A ports (TV mode) or the console's top USB-C port, after turning on "Pro Controller Wired Communication" in System Settings | S2-verified | [Nintendo 68551](https://en-americas-support.nintendo.com/app/answers/detail/a_id/68551), [Nintendo 68263](https://en-americas-support.nintendo.com/app/answers/detail/a_id/68263) |
| A microcontroller as a wired pad (HORIPAD-style "Switch" mode) | GP2040-CE boards are sold as Switch 2 compatible | Reported, strong | [Focus Attack](https://focusattack.com/gp2040-ce-v5-6e-usb-b-usb-c-open-source-multi-console-fight-board/) |
| A microcontroller as a wired Pro Controller | GP2040-CE v0.7.12 "Switch Pro" mode is listed as Switch 2 compatible (motion in progress) | Reported | [GP2040-CE releases](https://github.com/OpenStickCommunity/GP2040-CE/releases), [PR #1365](https://github.com/OpenStickCommunity/GP2040-CE/pull/1365) |
| A bridge the hub can feed (serial in, USB pad out) | Several Pico firmwares take input over UART; one lists a Switch 2 wired-controller option; none is proven on Switch 2 by its own docs | Reported / unknown | [switch-pico](https://github.com/jyapayne/switch-pico), [Pokémon Automation UART](https://pokemonautomation.github.io/SetupGuide/Controllers/Controller-PicoW-UART.html) |
| Bluetooth emulation from Linux (Switch 1 Pro identity) | NXBT pairs and controls a Switch 2; reconnection after sleep was fragile and recently fixed in a fork | Reported | [BlueRetro #1309](https://github.com/darthcloud/BlueRetro/issues/1309), [GrantWK/nxbt #2](https://github.com/GrantWK/nxbt/issues/2) |
| Waking the console with a controller | Switch 1 controllers cannot wake a Switch 2 from sleep (HOME does not exit sleep) | S2-verified | [Nintendo: transferring](https://www.nintendo.com/en-gb/Hardware/Nintendo-Switch-2/Transferring-from-Nintendo-Switch/Transferring-to-Nintendo-Switch-2-2785638.html) |
| Switch 2 Pro Controller emulation (BLE) | Possible on ESP32, but it reimplements Nintendo's controller pairing handshake | Reported; **excluded by the rules** | [espp PR #765](https://github.com/esp-cpp/espp/pull/765) |
| HDMI-CEC | "Match TV Power State": the console turns the TV on when it wakes, and turning the TV off puts the console to sleep | S2-verified | [Nintendo 68188](https://en-americas-support.nintendo.com/app/answers/detail/a_id/68188) |
| TV wakes the console, or switches input to it | Not documented | Unknown; test on the TV | — |
| Console state the hub can observe | No official LAN or HDMI status. Candidates: the TV's current input (already read by the TV adapter), and whether the dock powers the USB bridge | Unknown | — |

## Candidate control paths, ranked

1. **Wired bridge in the dock.** A Raspberry Pi Pico in a USB port of the dock presents itself as a
   wired pad; the hub sends it input over a USB serial cable. The pad identity is proven on Switch 2;
   the bridge firmware is not, so it is verified on the console before anything is built on it.
2. **Bluetooth from the laptop (NXBT, Switch 1 Pro identity).** No extra hardware, but reconnection is
   fragile, it needs changes to the laptop's Bluetooth setup, and it cannot wake the console.
3. **"Play" scene through the TV.** Turn the TV on and select the console's input through the TV
   adapter; the console wakes from a button on a real controller; turning the TV off sleeps the
   console through Match TV Power State.

Waking a sleeping Switch 2 without touching a real controller is not shown by any source yet.

**Decision for now (owner, 2026-10-17):** both paths, wired first. The parts for the wired bridge are
not at hand yet, so the hub ships with the Bluetooth path (verified below) and the wired bridge plugs
in later as a second output behind the same interface.

## The owner's setup (read on screen, nothing changed, 2026-10-17)
| Item | Value |
|---|---|
| Console system version | 23.0.1 |
| Docked to | The TV the hub already controls (input number kept in the private config) |
| Match TV Power State | On |
| Pro Controller Wired Communication | Off (a wired bridge needs it on: owner's "go" first) |
| Free USB-A ports on the dock | 1 |
| TV HDMI control (CEC) | On |
| Other hardware | A Switch 2 Pro Controller (can wake the console); no capture card, no microcontroller |

## Verified here
- **Console on screen, as the TV sees it:** with only the console picture showing, the TV adapter
  read the foreground package `com.mediatek.wwtv.tvcenter` (the TV's built-in input app); with a TV
  menu open over it, `com.android.tv.settings`. The package says "an external input or a TV channel
  is showing", not which input, and nothing about the console itself. The hub therefore shows the
  console as **assumed** on: the input app is in front and the hub itself selected the console's input.
- **Bluetooth emulation works on this Switch 2 (system 23.0.1), 2026-10-17.** NXBT 0.1.4 (upstream
  Brikwerk/nxbt, run as root from a venv, Switch 1 Pro Controller identity) on the laptop's Intel
  AX201 adapter with BlueZ 5.64. Paired through Change Grip/Order 47.6 s after the script started
  (most of it walking to the screen). On the console's Test Controller Buttons screen the owner saw
  the sequence arrive: A, B, X, Y, L, R, ZL, ZR, the four D-pad directions, both stick clicks, and both
  sticks in four directions. Still connected at the end. NXBT's BlueZ override (`--noplugin=*`, a
  runtime file under `/run/systemd`) was removed afterwards and Bluetooth restarted normally.
  Not tested yet: reconnection after the console sleeps, latency, and long sessions.
- **Through the hub and the sidecar service, 2026-10-17.** Paired through Change Grip/Order once the
  unit allowed `CAP_NET_BIND_SERVICE` (the HID channels are L2CAP PSMs 17 and 19). The owner checked
  every button and both sticks on Test Controller Buttons from the iPhone. Latency judge through the
  real sidecar: 1000 of 1000 frames acked, hub receive to sidecar write p95 0.13 ms, client send to ack
  p95 0.75 ms (the Bluetooth link and the phone's Wi-Fi are not in these numbers). Turning the phone's
  Wi-Fi off released the held button on the console.
- **No reconnect after sleep on the Switch 2.** After the console slept, nxbt's controller ended in
  `crashed`. Reconnecting to the saved address was refused with `ConnectionResetError: [Errno 104]
  Connection reset by peer` on three tries, also right after a service restart with the console
  awake. Pairing again through Change Grip/Order works. Not investigated further (owner, 2026-10-17);
  the wired bridge avoids Bluetooth reconnects altogether.
