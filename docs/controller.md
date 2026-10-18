# The phone controller

Your phone can be a controller for a console the hub knows (today: the Nintendo Switch 2, through
Bluetooth controller emulation on the hub computer). You can try it without any hardware in the
showcase or in demo mode, where a simulated console shows what it would receive.

Playing a real Switch 2? Read [switch-2.md](switch-2.md) first: how to pair, why you pair again after
the console sleeps, and what the emulated controller cannot do.

## Play
1. Open the console in the app (tap its card), or scroll to "A controller in your pocket" on the
   showcase.
2. Under **Controller**, pick a layout: **Pro Controller**, **Mario Kart** (steer by tilting the
   phone), **Party** (a few large buttons) or **One-handed (right)**. Layouts you saved are listed first.
3. Tap **Play with …**. The controller fills the screen. Turn the phone on its side; in portrait it
   asks you to.
4. Tap **Done** (or press Escape on a keyboard) to stop. Every button is released when you leave.

What to expect:
- **Several fingers at once.** Each finger is tracked on its own. Drag a finger from one button onto
  the next and the next one is pressed (handy for A to B rolls). A finger that starts on a stick keeps
  the stick wherever it goes; the stick has a small dead zone in the middle.
- **Feedback.** A pressed button turns crimson at once. iPhones have no vibration for web apps, so
  turn on **Click sound** in Settings for a short click on every press.
- **The status line** at the top says whether the controller is connected, what drives the console
  (Bluetooth, USB later, or Simulated), and the last round trip from the phone to the hub in
  milliseconds. "Another phone is using this controller" means one controller is already in use; it
  connects by itself when the other phone stops.
- **Safety.** If the app goes to the background, the screen locks, or the connection drops, the phone
  releases everything, and the hub releases every button by itself if it hears nothing for a tenth of a
  second. A button can never stay stuck down. A phone that went silent for 5 seconds (it left the Wi-Fi
  without saying goodbye) loses the controller, so the next phone can take it at once.
- **The screen stays on** while you play, where the browser allows it, and the app asks for full screen
  where it can (on an iPhone, add the app to the Home Screen for full screen).
- **Keyboard.** The arrow keys work as the D-pad; A, B, X, Y, L and R press those buttons; Enter is Plus.

### Tilt steering
Layouts with tilt (Mario Kart) ask first whether you want to steer by tilting. Hold the phone like a
wheel and turn it. On an iPhone, Safari then asks for access to motion and orientation; this only works
over HTTPS ([https-on-lan.md](https-on-lan.md)). Only the steering angle goes to the hub. If you say no,
steer with the stick; the **Tilt** button in the status line asks again. A finger on the left stick
always overrides tilt.

### Macros
A layout can carry macros: a short, fixed sequence of presses. They are marked **offline single-player
only**, and the app asks before running one. Do not use them in online play. The app cannot record
macros yet.

## Make your own layout
Tap **Edit layouts**. The builder shows the layout as the phone shows it on its side.
- **Start from** any preset or saved layout.
- **Move** a control by dragging it, or select it and use the arrow keys. **Resize** with Shift and the
  arrow keys, or with the Size slider. **Opacity** makes a control fainter.
- **Presses** sets what the control does: any button, the left or right stick, or the D-pad.
- **Add** buttons, shoulder buttons, sticks and D-pads (up to 40 controls); **Remove** the selected one.
- Tick **Steer the left stick by tilting the phone** for tilt steering.
- **Save as my layout** keeps it on the hub (every phone signed in to the hub sees it). In demo mode it
  is kept in this browser only. To rename a layout, change its name and tap **Save changes**.
  **Delete layout** asks before it deletes.

## For developers
The controller does not use the command API. The phone opens a WebSocket to
`GET /api/gamepad/:deviceId` and sends a full `GamepadFrame` on every change and at least every 40 ms;
the hub answers with `ack`, `state` and `error` messages. The contract is in
`packages/device-sdk/src/gamepad.ts`, the phone side in `packages/client/src/gamepad.ts`, the presets
in `packages/device-sdk/src/presets.ts`, and the screens in `apps/web/src/Player.tsx` and
`apps/web/src/Builder.tsx`. Layout positions are the control's centre as a share of the landscape
screen's width and height; a control's size is its diameter as a share of the screen height.
