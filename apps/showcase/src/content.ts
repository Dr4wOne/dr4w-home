// The showcase copy deck. Every claim is true of the kit today or is marked as planned, and every
// command shown is one the kit really has (docs/quickstart.md).

export const links = {
  github: 'https://github.com/Dr4wOne/dr4w-home',
  blog: 'https://blog.dr4w.io',
  site: 'https://dr4w.io',
  quickstart: 'https://github.com/Dr4wOne/dr4w-home/blob/main/docs/quickstart.md',
  addDevice: 'https://github.com/Dr4wOne/dr4w-home/blob/main/docs/add-a-device.md',
}

export const showcase = {
  title: 'dr4w home',
  headline: 'Your living room, on one page',
  sentence:
    'An open-source hub that runs on a computer in your home. Your phone talks to it; it talks to your TV, consoles and lights. Nothing goes through a cloud.',
  primary: 'Try the living room',
  secondary: 'Get the code',
  demoBanner: 'Demo mode: these devices are simulated in your browser. Nothing real is controlled.',
  tryLine: 'Tap the TV. Say "movie night". Pull the lamp\'s plug and see what the hub does.',
}

/** The argument of the page, as claims with their proof (taste-skill step 2). */
export const claims = [
  {
    claim: 'It answers in the time of a tap',
    proof:
      'Volume on a real Android TV, confirmed by the TV itself: 51 ms median, 64 ms for 95 of 100 presses.',
  },
  {
    claim: 'It tells you what the device said, not what it hopes',
    proof:
      'Every command is read back. If the TV disagrees, the screen goes back to the truth and says so. Values the device cannot report are marked as assumed.',
  },
  {
    claim: 'It stays in your home',
    proof:
      'The hub has no public address. Away from home, your phone reaches it through your own private VPN. The showcase you are using has no server at all.',
  },
  {
    claim: 'Adding a device is a recipe, not a research project',
    proof:
      'Each device type is a small adapter package with a test kit, recorded fixtures and a block-list of commands it must never send. A guided command scaffolds one.',
  },
]

export const steps = [
  {
    say: 'First, run the hub at home.',
    call: 'git clone https://github.com/Dr4wOne/dr4w-home\ncd dr4w-home && docker compose up -d',
    result: 'The hub starts on your home network and serves the app to your phone.',
  },
  {
    say: 'Then pair your TV.',
    call: 'pnpm --filter @dr4w-home/hub cli pair <tv-ip>',
    result: 'A six-character code appears on the TV. Type it once; the hub remembers the TV.',
  },
  {
    say: 'Then open it on your phone.',
    call: 'sudo tailscale serve --bg 8790\npnpm --filter @dr4w-home/hub cli link',
    result:
      'Scan the code with your phone and add the page to your Home Screen. It opens like an app, at home or away through your VPN.',
  },
]

export const architecture = {
  caption:
    'The phone only ever talks to the hub. The hub talks to each device in its own protocol, on your home network.',
  nodes: [
    { id: 'phone', label: 'Your phone', note: 'The web app, from your Home Screen' },
    { id: 'vpn', label: 'Private VPN', note: 'Only when you are away' },
    { id: 'hub', label: 'The hub', note: 'A computer at home: adapters, scenes, state' },
    { id: 'tv', label: 'TV', note: 'Android TV Remote protocol' },
    { id: 'consoles', label: 'Consoles', note: 'Through the TV over HDMI-CEC (planned)' },
    { id: 'lights', label: 'Lights', note: 'Adapter of your choice' },
  ],
}

export const compatibility = [
  {
    device: 'Android TV and Google TV',
    status: 'Works',
    note: 'Tested on a Philips Android TV: power, volume, mute, navigation, apps',
  },
  {
    device: 'Nintendo Switch',
    status: 'Planned',
    note: 'Wake and input through the TV; controller from the phone',
  },
  { device: 'Nintendo Switch 2', status: 'Planned', note: 'Verified separately from the Switch' },
  {
    device: 'Your device',
    status: 'Add it',
    note: 'Follow the recipe; the demo fan is the worked example',
  },
]

export const cta = {
  sentence: 'Bring your own TV, it takes about thirty minutes.',
  after:
    'The quickstart starts with demo mode, so you can try everything before connecting a device.',
}

export const footer = {
  what: 'dr4w home, an open-source home hub',
  licence: 'MIT licence',
}
