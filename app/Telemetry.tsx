'use client'

// Error reports (Sentry) and cookieless visit counts (Vercel Web Analytics); both described on /privacy.
// Sentry runs only where NEXT_PUBLIC_SENTRY_DSN is set at build time (the production project), so local
// builds and forks of the open repository report nothing. No personal data is attached to reports.
//
// A share link carries a whole kit after the "#". The privacy page promises it never reaches a server,
// so every URL either tool sends has its fragment removed here.
import * as Sentry from '@sentry/browser'
import { Analytics } from '@vercel/analytics/next'
import { useEffect } from 'react'

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
let started = false

/** Removes the fragment from a URL anywhere inside a string. */
export const stripFragment = (s: string) => s.replace(/#[^\s"')]*/g, '')

function scrub<T>(value: T): T {
  if (typeof value === 'string') return stripFragment(value) as T
  if (Array.isArray(value)) return value.map(scrub) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)])) as T
  return value
}

export function Telemetry() {
  useEffect(() => {
    if (!DSN || started) return
    started = true
    Sentry.init({
      dsn: DSN, tracesSampleRate: 0, environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'local',
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false }, // no user, cookie or header data in reports
      // Request URL, exception messages and breadcrumbs (navigation from/to, fetch URLs) all lose their fragment.
      beforeSend: (event) => scrub(event),
      beforeBreadcrumb: (crumb) => scrub(crumb),
    })
  }, [])
  return <Analytics beforeSend={(e) => ({ ...e, url: stripFragment(e.url) })} />
}
