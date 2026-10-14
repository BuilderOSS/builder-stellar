import type { MetadataRoute } from 'next';

import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

// Theme colours mirror colors.canvas in the dark hero theme, as in the root layout's viewport.
const CANVAS_DARK = '#141311';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: 'Tribes',
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: CANVAS_DARK,
    theme_color: CANVAS_DARK,
    icons: [
      { src: '/pwa-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
