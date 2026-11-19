import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Privacy · Ergane', description: 'What Ergane processes about visitors, and what it does not.' }

export default function Privacy() {
  return (
    <main className="doc">
      <p><Link href="/" className="link">← Back to Ergane</Link></p>
      <h1 className="it">Privacy</h1>
      <p>Ergane is a laser cut kit generator that runs in your browser. It has no accounts, sets no cookies and has no server of its own. This page lists everything that does reach a third party.</p>

      <h2 className="it">Stays in your browser</h2>
      <p>Your parts, kits, calibrated kerf and press fit, machine profiles, materials and imported components are stored only in this browser (local storage). Nobody else can see them. Clearing your browser data deletes them, so export a kit file to keep a copy.</p>
      <p>A share link carries the kit after the <code>#</code> in the address. Browsers never send that part to a server, so the kit travels only to whoever you give the link.</p>

      <h2 className="it">Processed by others</h2>
      <dl className="doc-list">
        <dt>Hosting (Vercel)</dt>
        <dd>Vercel serves the site and, like every web host, receives your IP address and browser details with each request. It keeps request logs for a short period for security and operations.</dd>
        <dt>Visit counts (Vercel Web Analytics)</dt>
        <dd>Counts page views and two events (exporting a part and exporting a kit), without cookies and without identifying you across sites or days.</dd>
        <dt>Error reports (Sentry, EU region)</dt>
        <dd>When the app crashes, an error report is sent: the error message, where in the code it happened, browser and system version, and the page address. Your IP address is used to deliver the report but is not stored with it. No kit contents are sent.</dd>
      </dl>
      <p>The legal basis is the legitimate interest in running and improving a free tool. Both services act as processors under data processing agreements.</p>

      <h2 className="it">Your rights</h2>
      <p>Under the GDPR you can ask what data about you is processed, ask for it to be erased, or object to processing. Because Ergane stores nothing that identifies you, there is usually nothing to hand over or delete beyond the short-lived hosting logs. You can also complain to the Belgian Data Protection Authority (gegevensbeschermingsautoriteit.be).</p>

      <h2 className="it">Contact</h2>
      <p>Ergane is made by Studio Vinnie, Belgium. Questions about privacy: <a className="link" href="mailto:hello@vinnie.studio">hello@vinnie.studio</a>.</p>
      <p>Ergane is open source; the code that does all of this is on <a className="link" href="https://github.com/VincentPeters/ergane">GitHub</a>.</p>
      <p className="note-text">Last updated 19 November 2026.</p>
    </main>
  )
}
