import type { NextConfig } from 'next'

// Static export: no server code, so the site runs on Vercel or any static host.
export default { output: 'export' } satisfies NextConfig
