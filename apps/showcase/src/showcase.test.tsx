// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { controller, links, showcase } from './content.ts'
import { render } from './prerender.tsx'

it('prerenders the whole page in demo mode, with the way out to the code, the blog and dr4w.io', () => {
  const html = render()
  expect(html).toContain(showcase.demoBanner)
  // The controller demo: its virtual screen is part of the first paint, the player loads on demand.
  expect(html).toContain(controller.title)
  expect(html).toContain('Simulated console screen')
  for (const url of [links.github, links.blog, links.site]) expect(html).toContain(`href="${url}"`)
  // A static demo: no script or stylesheet from anywhere else, and nothing that looks like a key.
  expect(html).not.toMatch(/<(script|link)[^>]+(src|href)="https?:/)
  expect(html).not.toMatch(/api[_-]?key|secret|token=/i)
})
