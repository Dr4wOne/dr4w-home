import { hydrateRoot } from 'react-dom/client'
import '@dr4w-home/web/base.css'
import './showcase.css'
import { Showcase } from './Showcase.tsx'

// The HTML is rendered at build time (prerender.tsx); this only makes it interactive.
hydrateRoot(document.getElementById('root') as HTMLElement, <Showcase />)
