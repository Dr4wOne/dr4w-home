// home.dr4w.io: the kit's showcase. Static, demo mode only: every device runs in the browser.

import { LivingRoom, PowerMark } from '@dr4w-home/web/embed'
import { type CSSProperties, useState } from 'react'
import lampPhoto from './assets/lamp.webp'
import remotePhoto from './assets/remote-dpad.webp'
import {
  architecture,
  claims,
  compatibility,
  cta,
  footer,
  links,
  showcase,
  steps,
} from './content.ts'

const delay = (i: number) => ({ '--i': i }) as CSSProperties

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn copy"
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => {})
        setDone(true)
        setTimeout(() => setDone(false), 1600)
      }}
    >
      {done ? 'Copied' : 'Copy'}
      <span className="visually-hidden" aria-live="polite">
        {done ? 'Copied to the clipboard' : ''}
      </span>
    </button>
  )
}

const TAB_NAMES = ['Fast', 'Honest', 'Private', 'Open']

function Claims() {
  const [i, setI] = useState(0)
  const c = claims[i] ?? claims[0]
  return (
    <section className="plate" aria-labelledby="claims-title" id="why">
      <figure className="plate-photo shutter">
        <img
          src={remotePhoto}
          width={520}
          height={520}
          loading="lazy"
          alt="The round direction pad of a TV remote control, on a wooden table"
        />
        <PowerMark className="plate-mark" stroke={4} />
      </figure>
      <div className="plate-text">
        <h2 id="claims-title" className="visually-hidden">
          Why it works this way
        </h2>
        <div className="tabs" role="tablist" aria-label="What the hub promises">
          {claims.map((x, n) => (
            <button
              key={x.claim}
              type="button"
              role="tab"
              id={`claim-tab-${n}`}
              aria-selected={n === i}
              aria-controls="claim-panel"
              tabIndex={n === i ? 0 : -1}
              onClick={() => setI(n)}
              onKeyDown={(e) => {
                const next =
                  e.key === 'ArrowRight'
                    ? (n + 1) % claims.length
                    : e.key === 'ArrowLeft'
                      ? (n + claims.length - 1) % claims.length
                      : -1
                if (next < 0) return
                setI(next)
                document.getElementById(`claim-tab-${next}`)?.focus()
              }}
            >
              {TAB_NAMES[n]}
            </button>
          ))}
        </div>
        <div
          id="claim-panel"
          role="tabpanel"
          aria-labelledby={`claim-tab-${i}`}
          className="claim"
          key={i}
        >
          <p className="claim-title">{c?.claim}</p>
          <p className="claim-proof">{c?.proof}</p>
        </div>
        <div className="cells">
          <a className="cell ink" href="#living-room">
            {showcase.primary}
          </a>
          <a className="cell" href={links.github}>
            {showcase.secondary}
          </a>
        </div>
      </div>
    </section>
  )
}

function Steps() {
  return (
    <section className="steps" aria-labelledby="steps-title" id="how">
      <h2 id="steps-title" className="big" data-reveal>
        How it works
      </h2>
      <ol className="bar" data-ui>
        {steps.map((s, n) => (
          <li key={s.say} className={`seg seg-${n}`} data-reveal style={delay(n)}>
            <p className="seg-say">{s.say}</p>
            <div className="seg-call">
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a block that scrolls must be reachable by keyboard */}
              <pre tabIndex={0}>
                <code>{s.call}</code>
              </pre>
              <CopyButton text={s.call} />
            </div>
            <p className="seg-result">{s.result}</p>
          </li>
        ))}
      </ol>
      <figure className="arch" data-reveal>
        <Diagram />
        <figcaption>{architecture.caption}</figcaption>
      </figure>
    </section>
  )
}

const node = (id: string) =>
  architecture.nodes.find((n) => n.id === id) ?? { id, label: id, note: '' }

function Diagram() {
  const desc = architecture.nodes.map((n) => `${n.label}: ${n.note}.`).join(' ')
  const devices = ['tv', 'consoles', 'lights'].map(node)
  const phone = node('phone')
  const hub = node('hub')
  const vpn = node('vpn')
  return (
    <>
      <svg className="arch-wide" viewBox="0 0 1200 380" role="img" aria-labelledby="arch-t arch-d">
        <title id="arch-t">How the parts connect</title>
        <desc id="arch-d">{desc}</desc>
        <g className="arch-lines">
          <path d="M 160 170 H 450" />
          <path d="M 590 170 H 690" />
          <path d="M 690 170 C 770 170 770 70 846 70" />
          <path d="M 690 170 H 846" />
          <path d="M 690 170 C 770 170 770 270 846 270" />
        </g>
        <g transform="translate(100 170)">
          <circle r="56" className="arch-node" />
          <text y="96" className="arch-label" textAnchor="middle">
            {phone.label}
          </text>
          <text y="124" className="arch-note" textAnchor="middle">
            From your Home Screen
          </text>
        </g>
        <g transform="translate(305 140)">
          <text className="arch-note" textAnchor="middle">
            {vpn.label}
          </text>
          <text y="70" className="arch-note" textAnchor="middle">
            {vpn.note}
          </text>
        </g>
        <g transform="translate(520 170)">
          <circle r="72" className="arch-hub" />
          <text y="112" className="arch-label" textAnchor="middle">
            {hub.label}
          </text>
          <text y="140" className="arch-note" textAnchor="middle">
            Adapters, scenes, state
          </text>
        </g>
        {devices.map((n, i) => (
          <g key={n.id} transform={`translate(880 ${70 + i * 100})`}>
            <circle r="30" className="arch-node" />
            <text x="50" y="-4" className="arch-label">
              {n.label}
            </text>
            <text x="50" y="22" className="arch-note">
              {n.note}
            </text>
          </g>
        ))}
      </svg>
      <ol className="arch-tall" aria-hidden="true">
        {architecture.nodes.map((n) => (
          <li key={n.id} className={n.id === 'hub' ? 'is-hub' : ''}>
            <span className={`ring${n.id === 'hub' ? ' on' : ''}`} />
            <span>
              <strong>{n.label}</strong>
              <br />
              {n.note}
            </span>
          </li>
        ))}
      </ol>
    </>
  )
}

function Compatibility() {
  return (
    <section className="compat" aria-labelledby="compat-title" id="devices">
      <h2 id="compat-title" className="compat-title" data-reveal>
        What it works with today
      </h2>
      <div className="compat-body">
        <figure className="compat-photo" data-reveal>
          <img
            src={lampPhoto}
            width={474}
            height={593}
            loading="lazy"
            alt="A floor lamp lit above a low sofa against a dark blue quilted wall"
          />
        </figure>
        <table className="compat-table">
          <caption className="visually-hidden">Compatibility</caption>
          <thead className="visually-hidden">
            <tr>
              <th scope="col">Device</th>
              <th scope="col">What works</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {compatibility.map((r, i) => (
              <tr key={r.device} data-reveal style={delay(i)}>
                <th scope="row">
                  <span className={`ring${r.status === 'Works' ? ' on' : ''}`} aria-hidden="true" />
                  {r.device}
                </th>
                <td>{r.note}</td>
                <td className="status">
                  {r.status === 'Add it' ? <a href={links.addDevice}>{r.status}</a> : r.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Connect() {
  const [name, setName] = useState('Living room TV')
  const [kind, setKind] = useState<'tv' | 'demo'>('demo')
  return (
    <section className="connect" aria-labelledby="connect-title" id="connect">
      <div className="connect-words">
        <h2 id="connect-title" className="connect-title" data-reveal>
          Connect your own
        </h2>
        <p data-reveal style={delay(1)}>
          {cta.sentence} {cta.after}
        </p>
        <p className="connect-links" data-reveal style={delay(2)}>
          <a href={links.github}>GitHub</a>
          <a href={links.blog}>The blog</a>
          <a href={links.site}>dr4w.io</a>
        </p>
      </div>
      <form
        className="dialog"
        data-ui
        aria-labelledby="dialog-title"
        data-reveal
        onSubmit={(e) => {
          e.preventDefault()
          window.location.href = links.quickstart
        }}
      >
        <h3 id="dialog-title">Add your first device</h3>
        <label htmlFor="device-name">Name it</label>
        <input id="device-name" value={name} onChange={(e) => setName(e.target.value)} />
        <fieldset>
          <legend>Start with</legend>
          <div className="segmented">
            <label className={kind === 'demo' ? 'is-on' : ''}>
              <input
                type="radio"
                name="kind"
                checked={kind === 'demo'}
                onChange={() => setKind('demo')}
              />
              Demo mode
            </label>
            <label className={kind === 'tv' ? 'is-on' : ''}>
              <input
                type="radio"
                name="kind"
                checked={kind === 'tv'}
                onChange={() => setKind('tv')}
              />
              My Android TV
            </label>
          </div>
        </fieldset>
        <button type="submit" className="btn primary wide">
          Open the quickstart
        </button>
        <p className="dialog-note">
          {kind === 'demo'
            ? 'Runs on simulated devices first. No hardware needed.'
            : `"${name || 'Your TV'}" shows a six-character code when you pair it.`}
        </p>
      </form>
    </section>
  )
}

function Footer() {
  return (
    <footer className="foot">
      <div className="foot-mark" aria-hidden="true">
        <PowerMark className="foot-ring" stroke={16} />
        <span className="foot-word">dr4w home</span>
      </div>
      <nav className="foot-links" aria-label="Footer">
        <a href={links.github}>GitHub</a>
        <a href={links.quickstart}>Quickstart</a>
        <a href={links.addDevice}>Add a device</a>
        <a href={links.blog}>Blog</a>
        <a href={links.site}>dr4w.io</a>
      </nav>
      <p className="foot-credits">
        Pictures, cropped:{' '}
        <a href="https://www.rawpixel.com/image/6019387/photo-image-public-domain-newspaper-sunlight">
          “Television remote control”
        </a>{' '}
        and{' '}
        <a href="https://www.rawpixel.com/image/5914165/image-background-public-domain-blue">
          “Free living room image”
        </a>
        , <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, via rawpixel.
      </p>
      <div className="foot-last">
        <span>
          {footer.what} · {footer.licence}
        </span>
        <a className="btn ink" href={links.github}>
          {showcase.secondary}
        </a>
      </div>
    </footer>
  )
}

export function Showcase() {
  return (
    <>
      <a className="skip" href="#living-room">
        Skip to the living room
      </a>
      <aside className="demo-banner" aria-label="Demo mode">
        {showcase.demoBanner}
      </aside>
      <header className="nav">
        <a className="wordmark" href="/">
          dr4w<span className="wordmark-dot">.</span>home
        </a>
        <nav aria-label="Main">
          <a href="#why">Why</a>
          <a href="#how">How it works</a>
          <a href="#devices">Devices</a>
          <a href={links.github}>GitHub</a>
        </nav>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-words">
            <h1 id="hero-title">{showcase.headline}</h1>
            <p className="hero-sentence">{showcase.sentence}</p>
            <p className="hero-try">{showcase.tryLine}</p>
            <a className="btn primary" href="#living-room">
              {showcase.primary}
            </a>
          </div>
          <div className="stage">
            <PowerMark className="stage-ring" stroke={15} />
            <div className="stage-fragment">
              <LivingRoom />
            </div>
          </div>
        </section>
        <Claims />
        <div className="band" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <PowerMark key={i} className="band-mark" stroke={12} />
          ))}
        </div>
        <Steps />
        <Compatibility />
        <Connect />
      </main>
      <Footer />
    </>
  )
}
