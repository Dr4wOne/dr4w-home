// Puts the build-time render of the page into dist/index.html, so it paints before any script runs.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const { render } = await import(new URL('../dist-ssr/prerender.js', import.meta.url).href)
const file = new URL('../dist/index.html', import.meta.url)
const html = readFileSync(file, 'utf8')
if (!html.includes('<!--app-->')) throw new Error('dist/index.html has no <!--app--> placeholder')
writeFileSync(file, html.replace('<!--app-->', render()))
rmSync(new URL('../dist-ssr', import.meta.url), { recursive: true, force: true })
console.log('prerendered dist/index.html')
