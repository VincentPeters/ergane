import type { NextConfig } from 'next'

// Static export: no server code, so the site runs on Vercel or any static host.
// The dev indicator is off because it sits over the kit drawer's toggle in development.
export default { output: 'export', devIndicators: false } satisfies NextConfig
