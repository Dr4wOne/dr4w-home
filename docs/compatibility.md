# Compatibility

"Verified" means tested on real hardware with the state read back after each command.

| Device | Adapter | Status | Verified on | What works | Not yet |
|---|---|---|---|---|---|
| Android TV and Google TV | `adapter-android-tv` | Works | A Philips Android TV (Android TV OS 11) | Pairing, power on and off (Wake-on-LAN from deep standby), volume with read-back, mute, D-pad, Back, Home, current app, opening YouTube, Netflix, Disney+, Prime Video | HDMI input switching (the TV gives no read-back) |
| Nintendo Switch | — | Planned | — | Wake and input through the TV; the phone as a controller | Everything |
| Nintendo Switch 2 | — | Planned | — | Verified separately from the Switch | Everything |
| Simulated living room | `adapter-demo` | Works | Not hardware | Everything above, simulated, for demo mode and tests | — |

Add a row when you add an adapter ([add-a-device.md](add-a-device.md)).
