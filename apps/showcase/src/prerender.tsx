// Build-time render of the whole page, so it paints before any script runs (scripts/prerender.mjs).
import { renderToString } from 'react-dom/server'
import { Showcase } from './Showcase.tsx'

export const render = () => renderToString(<Showcase />)
