'use client'

// Error reports (Sentry) and cookieless visit counts (Vercel Web Analytics); both described on /privacy.
// Sentry runs only where NEXT_PUBLIC_SENTRY_DSN is set at build time (the production project), so local
// builds and forks of the open repository report nothing. No personal data is attached to reports.
import * as Sentry from '@sentry/browser'
import { Analytics } from '@vercel/analytics/next'
import { useEffect } from 'react'

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
let started = false

export function Telemetry() {
  useEffect(() => {
    if (!DSN || started) return
    started = true
    Sentry.init({
      dsn: DSN, tracesSampleRate: 0, environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'local',
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false }, // no user, cookie or header data in reports
    })
  }, [])
  return <Analytics />
}
