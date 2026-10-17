# Nintendo Switch 2: what works, what does not

Your phone can be a controller for a Nintendo Switch 2. The hub computer pretends to be a Pro
Controller over Bluetooth, and the phone tells it what to press. This page says plainly what that
gives you, what it does not, and what to do when something stops working.

Tested on one setup: a Switch 2 on system 23.0.1, docked to an Android TV, and a hub on Ubuntu 22.04
(BlueZ 5.64) with the laptop's built-in Bluetooth. Other setups may behave differently.

## In short
- **Works:** every button and both sticks, from one phone at a time, with a hub-side delay under 1 ms.
  A button never stays stuck: if the phone's Wi-Fi drops, everything is released within a tenth of a
  second.
- **The one thing to know:** each time the console sleeps or restarts, or the hub's controller service
  restarts, pair again: on the console open **Controllers → Change Grip/Order** for a few seconds.
  The Switch 2 does not let the emulated controller reconnect by itself.
- **The cost:** while the controller service runs, the hub computer cannot use any other Bluetooth
  device (headphones, keyboards, mice). Stop the service when you are done playing.

## Before you start
You need:
1. The hub running, with the Switch 2 in its config (`output` set to `bluetooth`):
   [the adapter's README](../packages/adapter-nintendo-switch/README.md#config).
2. The controller service (`dr4w-home-nxbt`) installed once, by hand, as root:
   [install steps](../packages/adapter-nintendo-switch/README.md#bluetooth-output-the-root-sidecar).
3. On the console, in **System Settings**: **Controllers & Accessories → Pro Controller Wired
   Communication** off. For turning on through the TV, also **TV Output → Match TV Power State** on and
   CEC on in the TV's settings.

## Play
1. On the hub computer, start the controller service:
   ```sh
   sudo systemctl start dr4w-home-nxbt
   ```
   From now on, other Bluetooth devices on this computer stop working (see [Limits](#limits)).
2. On the console, open **Controllers → Change Grip/Order**. Within a few seconds a Pro Controller
   appears. Leave the screen (press A on the phone, or use a Joy-Con).
3. On the phone, open the Switch 2 in the app, pick a layout under **Controller** and tap
   **Play with …**. The status line at the top shows **Connected · Bluetooth** and the round trip in
   milliseconds. **Hub connected, console not paired** means step 1 or 2 has not happened yet.
4. When you are done, stop the service to get the computer's Bluetooth back:
   ```sh
   sudo systemctl stop dr4w-home-nxbt
   ```

Layouts, tilt steering, the builder and the keyboard: [controller.md](controller.md).

## After the console sleeps
The Bluetooth connection ends when the console sleeps. When it is awake again:
1. Open **Controllers → Change Grip/Order** on the console.
2. Wait until the Pro Controller appears (a few seconds), then leave the screen.

You do not need to touch the hub. It stays ready to be paired all the time the service runs.
The same goes for a restart of the console or of the controller service.

## Limits
| Limit | Why | What to do |
|---|---|---|
| Pair again after every sleep or restart | The Switch 2 refuses the emulated controller's reconnect (`Connection reset by peer` in the log) | Change Grip/Order, a few seconds. The planned USB bridge will not have this limit |
| The phone cannot wake the console | A real controller wakes it by reconnecting, which the Switch 2 refuses here | Turn the TV on (in the app, or with the TV remote): Match TV Power State wakes the console with it |
| No other Bluetooth on the hub computer while the service runs | The emulation restarts the computer's Bluetooth with everything else switched off; a second Bluetooth adapter does not help | Stop the service after playing; it gives Bluetooth back at once |
| One player | The hub emulates one controller | A second phone waits ("Another phone is using this controller") and connects when the first one stops |
| A Switch 1 Pro Controller, not a Switch 2 one | That is what the emulation (nxbt) offers | No C button (GameChat), no motion controls sent to the console, no rumble, no amiibo (NFC). Tilt steering moves the left stick, so it works where a stick steers |
| Delay you may feel | Measured on the hub: under 1 ms. Not measured: the phone's Wi-Fi and the Bluetooth link | Fine for menus, party and casual games; not for competitive play. A good Wi-Fi signal near the phone helps most |
| The hub computer is visible as a "Pro Controller" | It stays discoverable so the console can pair at any time | Nearby phones and computers can see the name; nothing can control it except a Switch that pairs. Stop the service when you are not playing |
| "Turn on" does not switch the TV to the console | The TV gives no read-back for an input switch, so the hub does not send it | Switch the TV input once with the TV remote; the TV usually remembers it |
| Linux only | The emulation needs BlueZ (Linux Bluetooth) and runs as root | Use a Linux computer or a Raspberry Pi as the hub |

Macros are for offline single-player only; the app asks before running one ([controller.md](controller.md#macros)).

## When something does not work
Look at the service first: `journalctl -u dr4w-home-nxbt -f` (one line per event).

| What you see | Likely cause | Fix |
|---|---|---|
| The console never shows a Pro Controller on Change Grip/Order | The service is not running, or was installed from an older copy | `systemctl status dr4w-home-nxbt` should say `active (running)`. If it is old, install the service file and the sidecar again (README steps 2 and 3) |
| The phone says **Hub connected, console not paired** | The console slept or restarted, or the service is not running | Change Grip/Order on the console. If that does not help: `systemctl status dr4w-home-nxbt`, and check that the hub's user is in the `dr4w-home` group (`id` lists it; log out and in after adding it) |
| The phone says **Connected · Bluetooth**, the console does nothing | The console is on a screen that ignores this controller, or another controller is player 1 | Press Home on the phone; on Change Grip/Order, check the order of the controllers |
| The log shows `nxbt controller crashed` | Normal after the console sleeps; the service starts a fresh controller by itself 10 s later | Change Grip/Order on the console |
| Headphones on the hub computer went silent | The service is running | Stop it: `sudo systemctl stop dr4w-home-nxbt` |
| A button stayed pressed on the console | Should never happen: the hub releases everything after 0.1 s without news from the phone | Please open an issue with the time and the log lines from both services |

## Coming
- **A USB bridge** (a Raspberry Pi Pico on the dock's USB port): reconnects after sleep, leaves the
  computer's Bluetooth alone, and should shorten the delay.
- **Clearer status in the app:** tell "the controller service is not running" apart from "the
  console is not paired", and show "open Change Grip/Order" right in the status line.

How the controller service is built and why it runs as root: [security.md](security.md#the-bluetooth-sidecar-runs-as-root).
Evidence behind every line above: [the adapter's discovery notes](../packages/adapter-nintendo-switch/docs/discovery.md).
