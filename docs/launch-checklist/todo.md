# Ergane — Launch TODO

Steps for the open items in [checklist.md](./checklist.md). Ordered launch-blocking → first week → backlog.

## A. Launch-blocking (applicable Criticals)

### A0. Deploy `bf324df` to production — [layers 1, 6, 8] (done 2026-11-19, deployment `cut-grid-7d5bbvw9r`)
`vercel deploy --prod`, then check `curl -sI https://ergane.vinnie.studio` shows the CSP and `/privacy` loads.
Done when: both are live on ergane.vinnie.studio.

### A1. Security headers — [layer 1] (done in `bf324df`; kept for reference)
Static export ignores `next.config` headers, so set them in `vercel.json` at the repo root:
```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io; frame-ancestors 'none'; base-uri 'self'; form-action 'none'" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()" }
    ]
  }]
}
```
`'unsafe-inline'` for scripts is needed because Next's static export inlines its bootstrap script;
the sheet previews inject SVG built from numbers only. Add the analytics and Sentry origins once A4/A3 are chosen.
Done when: `curl -sI https://ergane.vinnie.studio` shows all five headers and the app still works
(export, kit drawer, share link) with no CSP errors in the console.

### A2. Privacy notice and licence — [layer 8] (done: /privacy, MIT + CC BY-SA 4.0)
1. Choose the licences. Suggested: MIT or Apache-2.0 for the code; CC BY-SA 4.0 (or CERN-OHL-S, an open hardware licence) for designs made with Ergane and the component library.
2. Add `LICENSE` to the repo and a short `/privacy` page (a second static page) covering:
   - Vercel serves the site and logs IP addresses; Vercel Web Analytics counts visits without cookies.
   - Sentry receives browser error reports.
   - Kits, calibration values and imported components are stored only in your browser; share links keep the kit after `#`, which never reaches a server.
   - Contact address and your GDPR rights.
3. Link both from the top bar or a small footer line.
Done when: `/privacy` loads, `LICENSE` is in the repo, and both are linked from the app.

### A3. Error tracking (Sentry) — [layer 6]
Done: project `studio-vinnie/ergane` (EU), SDK wired, DSN in Vercel production env, CSP allows the ingest host.
Left, in the Sentry dashboard:
1. Project settings → Security & Privacy → turn on "Prevent Storing of IP Addresses" (the privacy page promises it).
2. Organisation settings → Legal & Compliance → accept the DPA.
3. Alerts → confirm a "new issue" rule emails you (create one if the project has none).
4. After A0, run `throw new Error('sentry test')` in the browser console on ergane.vinnie.studio.
Done when: the test error shows in Sentry without an IP address, and the alert email arrives.

### A4. Uptime monitoring — [layer 6]
Create a free HTTP check (UptimeRobot or Better Stack) for `https://ergane.vinnie.studio`, every 5 min, alerting your email.
Done when: pausing the domain (or checking a bad path) triggers an alert email.

### A5. Rollback drill — [layer 11]
1. `vercel ls cut-grid --scope vincentpeters-projects` and note the current and previous production deployments.
2. `vercel rollback <previous-deployment-url> --scope vincentpeters-projects`, check the site, then `vercel promote <current-deployment-url>` back.
Done when: both commands worked and the steps are written in the runbook (A7).

### A6. Cross-browser check — [layer 12]
Open the site in Firefox and Safari (desktop + iPhone): edit a part, export SVG, open the kit drawer, load the starter kit, export the kit ZIP, copy and open a share link.
Done when: all steps work in both browsers with no console errors.

### A7. Runbook and incident plan — [layer 13] (done: `README.md`)
Add `README.md` with: what Ergane is, `npm i` / `npm run dev` / `npm test`, deploy (`vercel deploy --prod` or git push once B1 is done), rollback (A5), DNS (Cloudflare CNAME `ergane` → `9fb6b9fb65d45ff7.vercel-dns-016.com`, DNS only), browser storage keys (`cutgrid.*`, kept for compatibility), and an incident section: alert arrives → check Sentry/uptime → roll back → post a note on GitHub.
Done when: a fresh clone can be run, tested and deployed from the README alone.

### A8. Core Web Vitals and accessibility pass — [layers 2, 4]
1. Run PageSpeed Insights on `https://ergane.vinnie.studio` (mobile + desktop); note LCP, INP, CLS.
2. Run axe DevTools (or Lighthouse a11y) on the page with the kit drawer open; fix serious issues.
3. Tab through the whole page: top bar → library → parameters → drawer; every control reachable, focus visible.
Done when: CWV in the green, no serious axe issues, keyboard walk-through passes.

### A9. Physical acceptance tests — [layer 12]
Cut the calibration coupon and one acrylic box; follow `docs/specs.md` section 13/17.
Done when: kerf and press fit are calibrated, the box assembles, bolts and axles fit, and an export opens correctly in LightBurn and Inkscape.

## B. First week (Recommended)

### B1. Public GitHub repo + Vercel git integration — [layers 11, 13] (done 2026-11-19: github.com/VincentPeters/ergane, CI, ruleset on main, Vercel connected)
1. Create the repo (licence from A2), push `main`.
2. Connect it to the `cut-grid` Vercel project; production from `main`, previews per pull request.
3. Add a GitHub Action that runs `npm ci && npx vitest run && npm run build` on pull requests; require it before merge.
Done when: a pull request shows a passing check and a preview URL; merging deploys production.

### B2. robots.txt, sitemap, canonical and share preview — [layer 3]
Add `app/robots.ts` and `app/sitemap.ts` (static export supports both), `metadataBase: new URL('https://ergane.vinnie.studio')` plus `alternates.canonical: '/'` and `openGraph`/`twitter` fields in `app/layout.tsx`, and a 1200×630 share image (`app/opengraph-image.png`).
Done when: `/robots.txt` and `/sitemap.xml` return 200 and a link posted in Slack/Discord shows a preview card.

### B3. Cookieless analytics — [layer 9]
Code done (`<Analytics />`, `part_export` and `kit_export` events). Enable Web Analytics in the Vercel dashboard (project `cut-grid` → Analytics → Enable), then redeploy.
Done when: visits and export events show in the Vercel dashboard.

### B4. MFA and header scan — [layer 1]
Turn on MFA for Vercel, Cloudflare, GitHub and Sentry. Run Mozilla Observatory on the domain after A1.
Done when: MFA on everywhere; Observatory grade B or better.

### B5. Branded 404 and storage note — [layers 12, 7]
Add `app/not-found.tsx` in the atlas style; add one line in the kit drawer ("Kits are saved in this browser; export or share to keep a copy").
Done when: a bad URL shows the branded page; the note is visible in the drawer.

### B6. Proofread and launch post — [layers 12, 13]
Proofread all UI copy; write the post for the maker communities (what it does, one screenshot, the link, the GitHub repo).

## C. Backlog (Nice-to-have / accepted at launch)
- `/.well-known/security.txt` with a contact address.
- Vercel Speed Insights for real-user Web Vitals.
- Vercel spend alert.
- Screen-reader (NVDA) pass on the editor and kit export.
- Legal review of the privacy notice.
- Short threat model (kit/link/component import is the only untrusted input).
- Redirect `cut-grid.vercel.app` to the custom domain once old links no longer matter.
- Review this checklist after launch.
