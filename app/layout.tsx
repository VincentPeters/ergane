import type { Metadata, Viewport } from 'next'
import { Public_Sans, Spectral } from 'next/font/google'
import './globals.css'

// Self-hosted at build time by next/font, so no request leaves for Google at runtime.
const sans = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' })
const serif = Spectral({ subsets: ['latin'], weight: ['300', '400'], style: ['italic'], variable: '--font-serif' })

export const metadata: Metadata = {
  title: 'Cutgrid',
  description: 'Laser cut construction kit generator on one shared hole grid',
}
export const viewport: Viewport = { themeColor: '#0f1a33', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  )
}
