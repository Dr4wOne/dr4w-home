# Capability model for the hub device SDK: research and proposal

Status: research (2026-10-16); the model as built is `packages/device-sdk/src/index.ts`, which adds a `mode` capability (Matter Mode Select, Home Assistant `select` and fan `preset_mode`) for named settings such as fan speed. Sources are listed at the end. Where a fact comes from general knowledge of the Matter specification rather than a fetched source, it is marked "(spec, not re-verified)".

## 1. Matter data model

### 1.1 Hierarchy

| Level | Meaning |
|---|---|
| Node | One addressable device on the fabric. |
| Endpoint | A numbered functional unit on a node. Endpoint 0 is the root/utility endpoint. A TV can have one endpoint for the player and one per content app. |
| Device type | A named, versioned set of clusters that an endpoint must or may implement (from the Device Library spec). Example: Basic Video Player 0x0028. |
| Cluster | One feature area (On/Off, Level Control, Media Playback...). It has a server side (holds state, accepts commands) and a client side (sends commands). |
| Attribute | A typed, readable (sometimes writable) state value. Can be nullable. |
| Command | A typed request; many have a typed response command with a Status enum. |
| Event | A timestamped, numbered record of something that happened (with priority). Events are not lost when state changes quickly, unlike attributes. |

### 1.2 How Matter expresses optional parts

- **FeatureMap** (global attribute 0xFFFC, bitmap): which features the cluster instance supports. Each optional attribute or command has a conformance rule such as "mandatory if feature X", "optional", or "provisional". Example: Media Playback `Seek` is mandatory only with feature AS (AdvancedSeek).
- **AttributeList** (0xFFFB), **AcceptedCommandList** (0xFFF9), **GeneratedCommandList** (0xFFF8): the exact attributes and commands the instance implements, so a client can discover purely optional elements that no feature covers. (spec, not re-verified)
- **ClusterRevision** (0xFFFD): version of the cluster definition.
- Device types say which clusters are mandatory and which are optional on an endpoint.

### 1.3 How state is reported

- Clients **read** attributes, or **subscribe** to attribute paths and event paths.
- A SubscribeRequest carries **MinIntervalFloor** and **MaxIntervalCeiling** (seconds). The publisher picks the final MaxInterval (at least the floor; for intermittently connected devices it may go up to the idle-mode interval).
- The publisher sends a report when data changes, but not more often than MinInterval. If nothing changes, it sends an empty report at MaxInterval. That empty report is the **liveness check**: a missed report means the subscription is dead and the device is treated as unreachable. (spec, not re-verified; ICD rule confirmed by Silicon Labs docs)
- Commands return a status. Media commands return a cluster-specific status enum (for example `InvalidStateForCommand`, `UnsupportedKey`). The new state then arrives through the subscription, not in the command response.
- The Bridged Device Basic Information cluster has a `Reachable` attribute for bridged devices. (spec, not re-verified)

### 1.4 Relevant clusters (IDs and essentials from connectedhomeip XML)

| Cluster | ID | Features (FeatureMap bits) | State (attributes) | Commands | Notes |
|---|---|---|---|---|---|
| On/Off | 0x0006 | LT Lighting, DF DeadFrontBehavior, OFFONLY | `OnOff` bool; LT adds `OnTime`, `OffWaitTime`, `StartUpOnOff`, `GlobalSceneControl` | `Off` (M), `On`, `Toggle`, LT adds `OffWithEffect`, `OnWithRecallGlobalScene`, `OnWithTimedOff` | On a Speaker device, On/Off = mute (off means muted). |
| Level Control | 0x0008 | OO OnOff coupling, LT Lighting, FQ Frequency (obsolete) | `CurrentLevel` uint8 nullable, `MinLevel` (default 1), `MaxLevel` (default 254), `OnLevel`, `RemainingTime`, transition times, `Options` | `MoveToLevel`, `Move`, `Step`, `Stop`, and `*WithOnOff` variants | Level range 1..254. TransitionTime is in tenths of a second (spec, not re-verified). On a Speaker it is the volume. |
| Color Control | 0x0300 | HS, EHUE EnhancedHue, CL ColorLoop, XY, CT ColorTemperature | `CurrentHue`/`CurrentSaturation` 0..254, `CurrentX`/`CurrentY` 0..65279, `ColorTemperatureMireds`, `ColorTempPhysicalMin/MaxMireds`, `ColorMode` (0 HS, 1 XY, 2 CT), `ColorCapabilities` | `MoveToHue`, `MoveToSaturation`, `MoveToHueAndSaturation`, `MoveToColor`, `MoveToColorTemperature`, move/step variants, `ColorLoopSet`, `StopMoveStep` | Mireds = 1,000,000 / kelvin. Hue 0..254 maps to 0..360 degrees. |
| Media Playback | 0x0506 | AS AdvancedSeek, VS VariableSpeed, TT TextTracks, AT AudioTracks, AA AudioAdvance | `CurrentState` (Playing, Paused, NotPlaying, Buffering) mandatory; AS adds `StartTime`, `Duration`, `SampledPosition`, `PlaybackSpeed`, `SeekRangeStart/End`; tracks with AT/TT | `Play`, `Pause`, `Stop` (M); `StartOver`, `Previous`, `Next`, `Rewind`, `FastForward`, `SkipForward/Backward` (ms); `Seek` (AS); track commands | Response `PlaybackResponse` with Status (Success, InvalidStateForCommand, NotAllowed, NotActive, SpeedOutOfRange, SeekOutOfRange). Event `StateChanged`. Position is sampled (position + timestamp), so clients extrapolate. |
| Keypad Input | 0x0509 | NV NavigationKeyCodes, LK LocationKeys (Settings, Home), NK NumberKeys | none | `SendKey(KeyCode)` returns Status (Success, UnsupportedKey, InvalidKeyInCurrentState) | Key codes are HDMI-CEC UI command codes, for example Select 0x00, Up 0x01, Down 0x02, Left 0x03, Right 0x04, RootMenu 0x09, SetupMenu 0x0A, Exit 0x0D, ChannelUp 0x30, Power 0x40, VolumeUp 0x41, VolumeDown 0x42, Mute 0x43, Play 0x44, Pause 0x46, PowerOffFunction 0x6C, PowerOnFunction 0x6D, F1Blue..F4Yellow 0x71..0x74. |
| Audio Output | 0x050B | NU NameUpdates | `OutputList` (Index, OutputType HDMI/BT/Optical/Headphone/Internal/Other, Name), `CurrentOutput` | `SelectOutput(Index)`, `RenameOutput` (NU) | |
| Media Input | 0x0507 | NU NameUpdates | `InputList` (Index, InputType Internal/Aux/Coax/Composite/HDMI/Input/Line/Optical/Video/SCART/USB/Other, Name, Description), `CurrentInput` | `SelectInput(Index)`, `ShowInputStatus`, `HideInputStatus`, `RenameInput` (NU) | Direct model for TV HDMI input switching. |
| Application Launcher | 0x050C | AP ApplicationPlatform | `CatalogList` (with AP), `CurrentApp` nullable (Application = {CatalogVendorID, ApplicationID}, Endpoint) | `LaunchApp(Application?, Data?)`, `StopApp`, `HideApp` | Status: Success, AppNotAvailable, SystemBusy, PendingUserApproval, Downloading, Installing. |
| Application Basic | 0x050D | none | `VendorName`, `VendorID`, `ApplicationName`, `ProductID`, `Application`, `Status` (Stopped, ActiveVisibleFocus, ActiveHidden, ActiveVisibleNotFocus), `ApplicationVersion`, `AllowedVendorList` | none | Lives on each Content App endpoint. |
| Content Launcher | 0x050A | CS ContentSearch, UP URLPlayback, AS, TT, AT, CR, CQ, PS Presets | `AcceptHeader`, `SupportedStreamingProtocols` (UP) | `LaunchContent` (search), `LaunchURL` (UP), `PlayPreset` | `LaunchURL` is the closest Matter match to an Android deep link. |
| Channel | 0x0504 | CL ChannelList, LI LineupInfo, EG ElectronicGuide, RP RecordProgram | `ChannelList`, `Lineup`, `CurrentChannel` | `ChangeChannel`, `ChangeChannelByNumber`, `SkipChannel`, guide and record commands | |
| Target Navigator | 0x0505 | none | `TargetList`, `CurrentTarget` | `NavigateTarget` | Named screens such as "home" or "settings". |
| Low Power | 0x0508 | none | none | `Sleep` | Standby without losing the network. |
| Wake On LAN | 0x0503 | none | `MACAddress`, `LinkLocalAddress` | none | Tells the client how to wake the device; the wake itself is a magic packet, not a command. |

### 1.5 Device types (from `matter-devices.xml`; "locked" in the XML marks the clusters a device must have)

| Device type | ID | Mandatory server clusters | Optional server clusters |
|---|---|---|---|
| Basic Video Player | 0x0028 | On/Off, Media Playback, Keypad Input (plus Descriptor) | Media Input, Channel, Audio Output, Low Power, Wake On LAN, Target Navigator |
| Casting Video Player | 0x0023 | On/Off, Media Playback, Keypad Input, Content Launcher | Application Launcher, Media Input, Channel, Audio Output, Low Power, Wake On LAN, Target Navigator, Account Login |
| Content App | 0x0024 | Application Basic, Keypad Input, Application Launcher | Account Login, Content Launcher, Media Playback, Target Navigator, Channel |
| Speaker | 0x0022 | On/Off (mute), Level Control (volume) | |
| On/Off Light | 0x0100 | Identify, Groups, Scenes Management, On/Off (LT) | |
| Dimmable Light | 0x0101 | as On/Off Light plus Level Control (LT, OO) | |
| Extended Color Light | 0x010D | as Dimmable Light plus Color Control (XY and CT mandatory; HS, EHUE, CL optional) | |

Observation: a Matter video player has **no volume level attribute**. Volume is only relative keys (`VolumeUp`, `VolumeDown`, `Mute`) through Keypad Input, unless a Speaker endpoint is added. That matches Android TV, which usually exposes volume only as key presses plus an occasionally reported level.

## 2. Home Assistant entity model

### 2.1 Concepts

| Concept | Meaning |
|---|---|
| Integration (platform) | Code that talks to one kind of device or service (for example `androidtv_remote`). It provides entities for one or more domains. |
| Device | A physical thing in the device registry. It groups entities (`device_info`). |
| Entity | One controllable or observable aspect, in one **domain** (`light`, `media_player`, `remote`, `switch`, `sensor`...). Has a `unique_id`, a `state` string, and `attributes`. |
| Domain | Defines the state values, attributes, feature flags and actions (services) of its entities. |
| `supported_features` | Integer bitmask from the domain's `EntityFeature` enum. The UI shows only controls whose flag is set; HA strips call parameters for unsupported features. |
| Action (service) | `domain.action` call, for example `media_player.volume_set`, `remote.send_command`, `light.turn_on`. Targets entities, devices or areas. |
| `entity_category` | `config` or `diagnostic`; hides secondary entities from default dashboards. |
| State object | `state`, `attributes`, `last_changed` (state changed), `last_updated` (state or attributes changed), `last_reported` (any write), and `context` (id, user_id, parent_id) for causality. |

### 2.2 Availability, assumed state, optimistic updates

- `available = False` makes the state `unavailable` ("the entity cannot provide its state right now").
- `unknown` means "the entity has no value for its state" (for example right after start).
- `assumed_state = True` means the device cannot report its state, so the state is a guess. The frontend then shows separate on and off buttons instead of a toggle, because a toggle based on a guess can do the wrong thing.
- **Optimistic mode** (per integration, for example MQTT): the entity updates its state right after each command instead of waiting for confirmation. Default `true` if there is no state topic, else `false`.
- `should_poll = False` for push devices; otherwise HA polls (default 30 s for most platforms).

### 2.3 `media_player`

- States: `off`, `on`, `idle`, `playing`, `paused`, `buffering`. `standby` is deprecated in favor of `off` or `idle`.
- `MediaPlayerEntityFeature`: `TURN_ON`, `TURN_OFF`, `PLAY`, `PAUSE`, `STOP`, `PREVIOUS_TRACK`, `NEXT_TRACK`, `SEEK`, `VOLUME_SET`, `VOLUME_STEP`, `VOLUME_MUTE`, `SELECT_SOURCE`, `SELECT_SOUND_MODE`, `PLAY_MEDIA`, `MEDIA_ENQUEUE`, `MEDIA_ANNOUNCE`, `BROWSE_MEDIA`, `SEARCH_MEDIA`, `CLEAR_PLAYLIST`, `SHUFFLE_SET`, `REPEAT_SET`, `GROUPING`.
- Attributes: `volume_level` float 0..1, `volume_step` (default 0.1), `is_volume_muted`, `source` and `source_list` (plain strings), `sound_mode`/`sound_mode_list`, `app_id`, `app_name`, `media_content_id`, `media_content_type`, `media_duration`, `media_position` plus `media_position_updated_at` (seconds, sampled like Matter), title/artist/series/season/episode/channel, `media_image_url`, `shuffle`, `repeat`, `group_members`.
- Actions: `turn_on`, `turn_off`, `toggle`, `media_play`, `media_pause`, `media_play_pause`, `media_stop`, `media_next_track`, `media_previous_track`, `media_seek`, `volume_set`, `volume_up`, `volume_down`, `volume_mute`, `select_source`, `select_sound_mode`, `play_media(media_content_type, media_content_id, enqueue, announce, extra)`, `shuffle_set`, `repeat_set`, `join`, `unjoin`.
- Apps: HA has no separate app-launcher domain. Apps appear as `app_id`/`app_name`, sometimes as entries in `source_list`, and launch through `play_media` with `media_content_type: app` or `url`.

### 2.4 `remote`

- Features: `LEARN_COMMAND`, `DELETE_COMMAND`, `ACTIVITY` (with `activity_list`, `current_activity`, and `activity` on `turn_on`).
- `send_command(command: list[str], num_repeats=1, delay_secs=0.4 default, hold_secs=0, device?)`. Commands are untyped strings that only the integration understands.

### 2.5 `light`

- `supported_color_modes` is required. Modes: `ONOFF`, `BRIGHTNESS` (each must be alone), `COLOR_TEMP`, `HS`, `XY`, `RGB`, `RGBW`, `RGBWW`, `WHITE` (needs a color mode beside it), `UNKNOWN` (only as current `color_mode`).
- `brightness` 1..255; `color_temp_kelvin` with `min_color_temp_kelvin` default 2000 and `max_color_temp_kelvin` default 6535.
- `LightEntityFeature`: `EFFECT`, `FLASH`, `TRANSITION` (seconds).
- `turn_on` receives at most one color attribute, already converted to a mode the light supports. Brightness 0 turns into `turn_off`.

### 2.6 Android TV in HA (`androidtv_remote`, the same protocol we will likely use)

- Creates a `media_player` (power, volume, mute, current app name, `play_media` with `app`, `url`, `channel`) and a `remote` (keys, text, app launch through `activity`).
- Playback state is **not** available from the protocol; HA assumes it. Deep links (`url`) are more reliable than app IDs.
- Key names: `DPAD_UP/DOWN/LEFT/RIGHT/CENTER`, `BACK`, `HOME`, `MENU`, `VOLUME_UP/DOWN`, `VOLUME_MUTE`, `MEDIA_PLAY_PAUSE`, `CHANNEL_UP/DOWN`, digits, `BUTTON_A/B/X/Y`, `SETTINGS`, `INFO`, `GUIDE`, `POWER`, `TV`, `PROG_RED/GREEN/YELLOW/BLUE`. Long press via `hold_secs` or `start_long:`/`end_long:`; text via `text:`.
- No HDMI input switching in this integration. Some TVs become unavailable after power-off.

## 3. Comparison

| Topic | Matter | Home Assistant | Take for our SDK |
|---|---|---|---|
| Unit of capability | Cluster on an endpoint, typed | Entity in a domain, loosely typed attributes | Typed capability, several per device (like clusters), with HA-style flat UI hints |
| Optional parts | FeatureMap bits plus AttributeList and AcceptedCommandList | `supported_features` bitmask (and `supported_color_modes`) | Typed `features` object per capability (booleans or literal lists), no bitmask |
| Composition | Device type = required plus optional clusters | Device groups entities; no formal type | Optional `profile` (for example `"tv"`, `"light.color"`) that lists required capabilities, for tests and UI layout |
| State reporting | Subscription with min/max interval; empty report as liveness | Push or poll; `last_updated`, `last_reported` | Push events from the driver, with `observedAt`; hub tracks liveness |
| Availability | Subscription timeout; `Reachable` on bridged devices | `unavailable` / `unknown` states | Device-level `availability` plus per-value `unknown` |
| Guessed state | Not modelled (devices are expected to report) | `assumed_state`, optimistic mode | Per-value `source: "reported" | "assumed"` |
| Volume on a TV | Keypad keys only (Speaker device adds Level Control) | `volume_level` 0..1 plus `VOLUME_STEP` | `volume` with `features.absolute` and `features.step` |
| Navigation keys | Typed CEC enum, status per key | Untyped strings in `remote.send_command` | Typed key enum based on CEC names; driver maps to its own codes |
| Apps | Application Launcher plus Content App endpoints; Content Launcher `LaunchURL` | `app_id`/`app_name`, `play_media` | `appLauncher` with catalog plus deep link launch |
| Inputs | Media Input with typed list | `source_list` strings | `inputSource` with typed list (id, name, kind) |
| Command result | Typed status enum per cluster | Exceptions, no typed result | Typed `CommandResult` union (ok, rejected with reason, unreachable, timeout) |
| Dangerous actions | Not modelled (access privileges like "manage" exist) | Not modelled | `danger` level per command, enforced by hub and UI |
| Gamepad | Not covered | Not covered | Own capability, modelled on the W3C Gamepad standard mapping |

## 4. Proposed capability model

### 4.1 Principles

1. A **device** has an id, a name, a driver id, an `availability`, and a list of **capabilities**. Each capability has a stable `id` (so a device can have two of the same type, like Matter endpoints) and a `type` literal as discriminant.
2. Each capability has `features` (what this instance supports), `state` (values with provenance), and a closed set of **commands**. Units and ranges live in `features`, so the UI never guesses.
3. Every state value carries **provenance**: `reported` (read back from the device), `assumed` (set optimistically after a command, or inferred), or `unknown`. `observedAt` is the time of the last report (HA `last_reported` equivalent).
4. Commands return a typed **result**; state changes arrive separately as events (Matter style). The hub can apply an optimistic value immediately as `assumed`, and replaces it when a report arrives or reverts it after a timeout.
5. Commands have a **danger** level. The hub refuses `confirm` commands without a confirmation token, and the UI asks first.
6. Normalised units: percent 0..100 for levels (convert from Matter 1..254, HA 1..255, HA 0..1), kelvin for color temperature (convert from mireds), degrees 0..360 and percent for hue/saturation, milliseconds for durations and transitions.

### 4.2 Capability table

| Capability `type` | Features | State | Commands | Matter | Home Assistant |
|---|---|---|---|---|---|
| `availability` (device level, not a capability) | `livenessIntervalMs` | `status: "online" \| "offline" \| "unknown"`, `lastSeenAt`, `reason?` | none | Subscription liveness, Bridged `Reachable` | `available`, state `unavailable` |
| `power` | `on`, `off`, `toggle` (booleans), `standbyKind?: "sleep" \| "off"`, `wakeOnLan?` | `power: "on" \| "off" \| "standby"` | `setPower(on: boolean)`, `toggle()` | On/Off (+ Low Power `Sleep`, Wake On LAN) | `TURN_ON`/`TURN_OFF`, state on/off |
| `volume` | `absolute: boolean`, `step: boolean`, `min: 0`, `max: 100`, `stepSize` | `level?: number` (percent) | `setVolume(level)`, `volumeUp()`, `volumeDown()` | Keypad `VolumeUp/Down` (video player) or Level Control (Speaker) | `VOLUME_SET`, `VOLUME_STEP`, `volume_level` |
| `mute` | `set: boolean` (false if the device only toggles) | `muted: boolean` | `setMute(muted)`, `toggleMute()` | Keypad `Mute`/`MuteFunction`, Speaker On/Off | `VOLUME_MUTE`, `is_volume_muted` |
| `keypad` (navigation) | `keys: KeyName[]` (supported subset), `longPress: boolean`, `text: boolean` | none | `pressKey(key, { holdMs?, repeat? })`, `sendText(text)` | Keypad Input (NV, LK, NK features, CEC codes) | `remote.send_command`, `hold_secs`, `num_repeats` |
| `appLauncher` | `catalog: { id, name, icon? }[]`, `deepLink: boolean`, `stop: boolean` | `currentApp?: { id, name }` | `launchApp(id)`, `openDeepLink(url)`, `stopApp(id)` | Application Launcher (`CurrentApp`, `LaunchApp`), Content Launcher `LaunchURL`, Application Basic | `app_id`/`app_name`, `play_media` type `app`/`url`, remote `activity` |
| `inputSource` | `inputs: { id, name, kind: "hdmi" \| "usb" \| "internal" \| "other" }[]`, `rename: boolean` | `currentInput?: string` | `selectInput(id)` | Media Input (`InputList`, `CurrentInput`, `SelectInput`) | `SELECT_SOURCE`, `source`, `source_list` |
| `audioOutput` (optional, later) | `outputs: { id, name, kind }[]` | `currentOutput?` | `selectOutput(id)` | Audio Output | `SELECT_SOUND_MODE` (closest) |
| `mediaPlayback` | `pause`, `stop`, `seek`, `nextPrevious`, `skipMs?` | `status: "playing" \| "paused" \| "stopped" \| "buffering"`, `position?: { ms, sampledAt }`, `durationMs?`, `title?` | `play()`, `pause()`, `stop()`, `next()`, `previous()`, `seek(ms)`, `skip(deltaMs)` | Media Playback (AS feature for seek/position) | `PLAY`, `PAUSE`, `STOP`, `SEEK`, `NEXT_TRACK`, `PREVIOUS_TRACK`, states playing/paused/idle/buffering |
| `activity` (for "playing" on the Switch) | `kinds: string[]` | `activity: "idle" \| "playing" \| "menu" \| "unknown"`, `title?` | none (read-only) | Application Basic `Status`, Media Playback `CurrentState` (closest) | `media_player` state `playing`/`idle`, `remote.current_activity` |
| `lightLevel` | `min: 1`, `max: 100`, `transition: boolean` | `level: number` (percent) | `setLevel(level, { transitionMs? })` | Level Control (LT, OO) | `brightness` 1..255, `TRANSITION` |
| `lightColor` | `modes: ("hs" \| "xy" \| "ct")[]`, `ctMinK`, `ctMaxK`, `transition` | `mode`, `hs?: { h, s }`, `xy?: { x, y }`, `ctK?` | `setColor(color, { transitionMs? })` where `color` is a union by mode | Color Control (HS, XY, CT features; mireds) | `supported_color_modes`, `color_mode`, `hs_color`, `xy_color`, `color_temp_kelvin` |
| `gamepad` | `layout: "standard" \| "switch-pro"`, `buttons: GamepadButton[]`, `axes: GamepadAxis[]`, `transport: "bluetooth" \| "usb"`, `maxRateHz` | `connected: boolean`, `playerIndex?` | `connect()`, `disconnect()`, `pressButtons(buttons, holdMs)`, `sendFrame({ buttons, axes })`, `runMacro(steps)` | None | None (W3C Gamepad standard mapping as reference) |

Notes on specific devices:

- **Android TV**: `power`, `volume` (`absolute` depends on what the remote protocol reports; often step only with a reported level), `mute`, `keypad`, `appLauncher` (`deepLink: true`; app IDs are less reliable), `inputSource` (only if the TV exposes it; the Android TV Remote protocol used by HA does not), `mediaPlayback` with `status` always `assumed`, because the protocol does not report playback.
- **Lamp (demo)**: `power`, `lightLevel`, `lightColor`. A good test case for `assumed` versus `reported`, because the demo can simulate a device that never reads back.
- **Nintendo Switch (later)**: `power` delegated through HDMI-CEC on the TV (the driver sends CEC standby or power-on on the bus; whether the console honours each direction must be tested on hardware), `activity` (likely inferred, for example "TV input is the Switch HDMI port and the console is awake", so its provenance is `assumed`), `gamepad` (controller emulation over Bluetooth, for example with nxbt). Capabilities may be **delegated**: the Switch's `power` command is executed by the TV driver. Model this as `via: { deviceId, capabilityId }` on the capability.

### 4.3 TypeScript sketch

```ts
// Provenance of every value: read back from the device, or a guess.
type Source = "reported" | "assumed";
type Value<T> =
  | { known: true; value: T; source: Source; observedAt: number }
  | { known: false };

type Danger = "none" | "confirm" | "blocked";

type Availability = {
  status: "online" | "offline" | "unknown";
  lastSeenAt?: number;
  reason?: string;
};

type KeyName =
  | "up" | "down" | "left" | "right" | "select" | "back" | "home" | "menu"
  | "settings" | "playPause" | "channelUp" | "channelDown" | "info" | "guide"
  | "red" | "green" | "yellow" | "blue"
  | `digit${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

type Base<T extends string, F, S> = {
  id: string;            // stable within the device, like a Matter endpoint plus cluster
  type: T;
  label?: string;
  features: F;
  state: S;
  via?: { deviceId: string; capabilityId: string }; // delegated, for example CEC through the TV
};

type PowerCap = Base<"power",
  { on: boolean; off: boolean; toggle: boolean; wakeOnLan?: boolean },
  { power: Value<"on" | "off" | "standby"> }>;

type VolumeCap = Base<"volume",
  { absolute: boolean; step: boolean; min: 0; max: 100; stepSize: number },
  { level: Value<number> }>;

type MuteCap = Base<"mute", { set: boolean }, { muted: Value<boolean> }>;

type KeypadCap = Base<"keypad",
  { keys: KeyName[]; longPress: boolean; text: boolean },
  Record<string, never>>;

type AppLauncherCap = Base<"appLauncher",
  { catalog: { id: string; name: string }[]; deepLink: boolean; stop: boolean },
  { currentApp: Value<{ id: string; name: string } | null> }>;

type InputSourceCap = Base<"inputSource",
  { inputs: { id: string; name: string; kind: "hdmi" | "usb" | "internal" | "other" }[] },
  { currentInput: Value<string> }>;

type MediaPlaybackCap = Base<"mediaPlayback",
  { pause: boolean; stop: boolean; seek: boolean; nextPrevious: boolean },
  {
    status: Value<"playing" | "paused" | "stopped" | "buffering">;
    position: Value<{ ms: number; sampledAt: number }>;
    durationMs: Value<number>;
  }>;

type ActivityCap = Base<"activity",
  { kinds: string[] },
  { activity: Value<"idle" | "playing" | "menu">; title: Value<string> }>;

type LightLevelCap = Base<"lightLevel",
  { min: number; max: number; transition: boolean },
  { level: Value<number> }>;

type Color =
  | { mode: "hs"; h: number; s: number }   // h 0..360, s 0..100
  | { mode: "xy"; x: number; y: number }   // CIE 1931, 0..1
  | { mode: "ct"; kelvin: number };

type LightColorCap = Base<"lightColor",
  { modes: Color["mode"][]; ctMinK?: number; ctMaxK?: number; transition: boolean },
  { color: Value<Color> }>;

type GamepadButton = "a" | "b" | "x" | "y" | "l" | "r" | "zl" | "zr" | "plus" | "minus"
  | "home" | "capture" | "dpadUp" | "dpadDown" | "dpadLeft" | "dpadRight" | "lStick" | "rStick";

type GamepadCap = Base<"gamepad",
  { layout: "switch-pro" | "standard"; buttons: GamepadButton[]; axes: ("lx" | "ly" | "rx" | "ry")[]; maxRateHz: number },
  { connected: Value<boolean> }>;

type Capability =
  | PowerCap | VolumeCap | MuteCap | KeypadCap | AppLauncherCap | InputSourceCap
  | MediaPlaybackCap | ActivityCap | LightLevelCap | LightColorCap | GamepadCap;

// Commands: one discriminated union, keyed by capability type.
type Command =
  | { type: "power"; op: "set"; on: boolean } | { type: "power"; op: "toggle" }
  | { type: "volume"; op: "set"; level: number } | { type: "volume"; op: "step"; direction: "up" | "down" }
  | { type: "mute"; op: "set"; muted: boolean } | { type: "mute"; op: "toggle" }
  | { type: "keypad"; op: "press"; key: KeyName; holdMs?: number; repeat?: number }
  | { type: "keypad"; op: "text"; text: string }
  | { type: "appLauncher"; op: "launch"; appId: string }
  | { type: "appLauncher"; op: "deepLink"; url: string }
  | { type: "inputSource"; op: "select"; inputId: string }
  | { type: "mediaPlayback"; op: "play" | "pause" | "stop" | "next" | "previous" }
  | { type: "mediaPlayback"; op: "seek"; ms: number }
  | { type: "lightLevel"; op: "set"; level: number; transitionMs?: number }
  | { type: "lightColor"; op: "set"; color: Color; transitionMs?: number }
  | { type: "gamepad"; op: "connect" | "disconnect" }
  | { type: "gamepad"; op: "press"; buttons: GamepadButton[]; holdMs: number }
  | { type: "gamepad"; op: "frame"; buttons: GamepadButton[]; axes: Partial<Record<"lx" | "ly" | "rx" | "ry", number>> };

type CommandResult =
  | { ok: true; applied: "confirmed" | "assumed" }
  | { ok: false; reason: "unsupported" | "invalidState" | "unreachable" | "timeout" | "needsConfirmation" | "rejected"; detail?: string };

// The driver declares danger per command; the hub enforces it.
type DangerRule = { type: Capability["type"]; op: string; danger: Danger; why: string };
```

### 4.4 Assumed versus confirmed state

1. The hub sends the command. If the driver says the device reports state (`reportsState: true` on the capability), the hub marks the target value `assumed` immediately and waits up to N seconds for a report.
2. A report replaces the value with `source: "reported"`. If no report arrives in time, the hub reverts to the last reported value and emits a warning event.
3. If the device never reports (IR, CEC without status, Android TV playback), the value stays `assumed` permanently. The UI then shows separate buttons (on and off, play and pause) instead of a toggle, as HA does.
4. On `availability.status = "offline"`, all values keep their last value but the UI greys them out, and commands return `unreachable` without being sent (unless the command is a wake command, such as Wake on LAN or CEC power-on).

### 4.5 Dangerous commands

| Level | Meaning | Examples |
|---|---|---|
| `none` | Safe and reversible | Volume step, navigation keys, light level |
| `confirm` | Needs an explicit confirmation from the UI (a token in the command) | Power off a console during `activity = playing` (unsaved game progress), large volume jumps (for example above 80 percent), sending gamepad macros, rename input |
| `blocked` | Never exposed to automations or remote callers, only to a local admin | Factory reset, firmware update, pairing or unpairing |

The level can be dynamic: a rule may depend on state (for example "power off is `confirm` only while `activity` is `playing`"). Keep it as a pure function `(device) => Danger` in the driver, so it is testable.

### 4.6 Generating a UI from capabilities

| Capability | Widget | Rules |
|---|---|---|
| `power` | Toggle; separate On and Off buttons if the value is `assumed` | Hidden ops follow `features` |
| `volume` | Slider if `absolute`, plus or minus buttons if `step` | Show the level only if `known` |
| `mute` | Toggle button with an icon | |
| `keypad` | D-pad (up, down, left, right, select) plus back, home and menu; number pad only if digits are in `keys` | Long press if `longPress`; a text field if `text` |
| `appLauncher` | Grid of app tiles; the current app is highlighted | Deep link field only in an advanced section |
| `inputSource` | Segmented control or select list | Icons by `kind` |
| `mediaPlayback` | Transport bar; seek bar only with `seek` and a known duration | Extrapolate position from `sampledAt` |
| `activity` | Status chip ("Playing", "Idle") with an "assumed" marker | Read-only |
| `lightLevel` | Slider 1..100 | |
| `lightColor` | Color wheel for `hs`/`xy`, kelvin slider for `ct`, tabs if several modes | Clamp to `ctMinK`..`ctMaxK` |
| `gamepad` | On-screen controller (Switch layout) with a connect button | Rate-limit frames to `maxRateHz` |

Generic rules: render one card per device, ordered by a fixed priority list (power, activity, inputSource, appLauncher, mediaPlayback, volume, mute, keypad, light, gamepad). Grey out everything when the device is offline. Show a small "assumed" marker for assumed values. Wrap `confirm` commands in a confirmation dialog. Every widget needs an accessible name from the capability `label`, and keyboard support (arrow keys for the D-pad, for example). The widget map is a `Record<Capability["type"], Component>`, so TypeScript reports a missing widget when a new capability type is added.

## 5. Open questions

- Does the Android TV Remote protocol report the absolute volume level for our TV model? This decides `volume.features.absolute`.
- Can the TV select HDMI inputs through the remote protocol, through ADB, or only through CEC? `inputSource` depends on the answer.
- Does the Switch honour CEC standby from the TV, and can the TV wake it? Test on hardware before promising `power` for the Switch.
- How to detect "playing" on the Switch: TV input plus CEC power status is a guess. There is no official API, so the value is always `assumed`.
- Should the hub also expose itself as a Matter bridge later? If yes, keep the capability-to-cluster mapping in section 4.2 exact and add tests for unit conversion.

## Sources

Matter:
- connectedhomeip cluster definitions (On/Off, Level Control, Color Control, Media Playback, Keypad Input, Audio Output, Media Input, Application Launcher, Application Basic, Content Launcher, Channel, Target Navigator, Low Power, Wake On LAN): https://github.com/project-chip/connectedhomeip/tree/master/src/app/zap-templates/zcl/data-model/chip
- Device type definitions: https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/chip/matter-devices.xml
- Keypad Input trait (Google Home Matter reference): https://developers.home.google.com/reference/kotlin/com/google/home/matter/standard/KeypadInputTrait
- CEC key code enum: https://developers.home.google.com/reference/kotlin/com/google/home/matter/standard/KeypadInputTrait.CecKeyCodeEnum
- Keypad Input in SmartThings Matter drivers: https://developer.smartthings.com/docs/edge-device-drivers/matter/generated/clusters/KeypadInput.html
- Matter data model overview (Nordic): https://nrfconnectdocs.nordicsemi.com/addons/ncs-matter/latest/_sources/matter/overview/data_model.rst.txt
- Matter clusters, attributes and commands (Espressif): https://developer.espressif.com/blog/matter-clusters-attributes-commands/
- Subscription intervals for intermittently connected devices (Silicon Labs): https://docs.silabs.com/matter/2.2.0/matter-overview-guides/matter-icd
- Basic Video Player device type ID 0x0028 (CSA listing): https://csa-iot.org/csa_product/basic-video-player/

Home Assistant:
- Entity base class (available, assumed_state, supported_features): https://contributors.home-assistant.io/core/entities/entity-class/ (formerly https://developers.home-assistant.io/docs/core/entity/)
- Media player entity: https://contributors.home-assistant.io/core/entities/media-player/
- Remote entity: https://contributors.home-assistant.io/core/entities/remote/
- Light entity: https://contributors.home-assistant.io/core/entities/light/
- State objects (unavailable, unknown, last_changed, last_updated, last_reported, context): https://www.home-assistant.io/docs/configuration/state_object/
- MQTT light optimistic mode: https://www.home-assistant.io/integrations/light.mqtt/
- Android TV Remote integration: https://www.home-assistant.io/integrations/androidtv_remote/

Gamepad:
- W3C Gamepad standard mapping: https://www.w3.org/TR/gamepad/#remapping
- nxbt (Nintendo Switch Pro Controller emulation over Bluetooth): https://github.com/Brikwerk/nxbt
