import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cutgrid',
  description: 'Laser cut construction kit generator',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
