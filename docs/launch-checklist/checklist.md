# Ergane — Production Launch Checklist

Status for going live at https://ergane.vinnie.studio (also served at https://cut-grid.vercel.app).
`[x]` done · `[~]` partial · `[ ]` open · N/A with reason.
Open-item steps: [todo.md](./todo.md). Last reconciled: 2026-11-19 (main, after `b025293`).

**Launch profile (from the questionnaire):** public, quiet launch (friends and a few maker communities,
a handful to a few hundred visitors). Static site, no accounts, no backend, no email. Visitor data:
cookieless analytics only. Monitoring: uptime monitor plus browser error tracking. Code goes public on
GitHub, with issues as the support channel. Owner is in Belgium, so EU rules (GDPR/ePrivacy) apply.

## Launch gate
Safe to go public once every **[Critical]** box that applies is `[x]`.
Open criticals: Sentry IP
setting + DPA (6, 8), uptime monitor (6), rollback drill (11), cross-browser check (12), Core Web Vitals (2),
keyboard + WCAG check (4), physical tests (12).

## 1. Security
**Scope:** static site. No accounts, no server endpoints, no database; all input is processed in the
browser. Untrusted input = kit files, share links and component JSON, all clamped in the core.
- [x] [Critical] HTTPS everywhere, HTTP→HTTPS redirect, HSTS — live check 2026-11-19: `308` to https, `Strict-Transport-Security: max-age=63072000`.
- [x] [Critical] Validate untrusted input — `clampPart`, `parseKit`, `sanitizeComponent`, `sanitizeMachine` in `src/core/*`; kit size and link inflation caps; CSV formula guard (`src/core/export.ts`); tests in `export.test.ts`.
- [x] [Critical] Secrets out of code and git — only secret is the Vercel OIDC token in `.env.local`, gitignored; `git log -S VERCEL_OIDC` empty.
- [x] [Critical] Preview builds not public — Vercel deployment protection `vercel_authentication` on previews.
- [x] [Critical] Security response headers — CSP, `frame-ancestors 'none'` + X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy in `vercel.json` (`bf324df`); verified on preview `cut-grid-dsrc2caj7` and app flow tested under the CSP (2026-11-19). Live on ergane.vinnie.studio since deployment `cut-grid-7d5bbvw9r` (2026-11-19).
- N/A — Authn/authz, OAuth redirects, bucket lockdown, encryption at rest: no accounts, keys or storage.
- N/A — WAF / rate limiting: no server endpoints; Vercel's platform DDoS mitigation covers the static CDN.
- [x] [Recommended] Dependency scan — `npm audit --omit=dev`: 0 vulnerabilities (2026-11-19).
- [ ] [Recommended] Header scan (Mozilla Observatory) after headers land.
- [ ] [Recommended] MFA on Vercel, Cloudflare, GitHub and Sentry accounts — verify in each dashboard.
- N/A — File upload limits: file imports never leave the browser; size is capped by the kit parser.
- [ ] [Nice-to-have] `/.well-known/security.txt` (404 today).
- [ ] [Nice-to-have] Threat model — security reviews of each commit were run; no written model.

## 2. Performance & Core Web Vitals
**Scope:** one static page; heavy work (nesting) runs on demand in the browser.
- [ ] [Critical] Core Web Vitals p75 (LCP < 2.5 s, INP < 200 ms, CLS < 0.1) — not measured. Watch INP: the kit drawer nests on every edit.
- [x] [Critical] Static assets on a CDN with long cache — `_next/static` served `public,max-age=31536000,immutable` (live check).
- [x] [Critical] LCP element optimised — no images; LCP is text/SVG with self-hosted fonts (`app/layout.tsx`, next/font).
- [x] [Recommended] Compression — Brotli on static assets (live check).
- [x] [Recommended] Viewport meta — present in the live HTML.
- [ ] [Recommended] Lighthouse / PageSpeed audit.
- [ ] [Nice-to-have] Real-user CWV via Vercel Speed Insights (cookieless).
- N/A — ISR / revalidation: fully static export.

## 3. SEO & Metadata
**Scope:** should be findable by makers searching for laser kit generators.
- [ ] [Critical] `robots.txt` + `sitemap.xml` — both 404 (live check).
- [x] [Critical] No staging `noindex` — none in the live HTML.
- [x] [Recommended] Title + meta description — `<title>Ergane</title>`, description set (`app/layout.tsx`).
- [ ] [Recommended] Canonical URL — two hosts serve the same page; canonical should point at ergane.vinnie.studio.
- [ ] [Recommended] Open Graph / Twitter card + share image — none.
- [ ] [Recommended] Google Search Console (+ Bing) verification.
- [x] [Nice-to-have] Favicon — `app/icon.svg` (strip mark), served at `/icon.svg` (200).

## 4. Accessibility
**Scope:** public tool; operated with mouse and keyboard next to a laser.
- [~] [Critical] WCAG 2.1 AA baseline — contrast tokens checked by the impeccable detector (clean), native controls with labels, `role="alert"` on rule failures, `aria-pressed`/`aria-checked` on toggles. Not audited end to end.
- [~] [Critical] Keyboard navigation + visible focus — 2 px amber `:focus-visible` outline (`app/globals.css`); all controls are native buttons/inputs/selects. Full keyboard walk-through not done.
- [ ] [Recommended] Automated audit (axe / Lighthouse a11y).
- [x] [Recommended] Contrast ≥ 4.5:1 — detector flagged low-contrast text during design and it was fixed; re-check in the axe run.
- [x] [Recommended] Labels and landmarks — `nav`, `main`, `aside`, `section aria-label="Kit"`, labelled inputs, preview `role="img"` with an `aria-label`.
- [ ] [Nice-to-have] Screen-reader pass (NVDA) on the part editor and kit export.
- [x] [Nice-to-have] `prefers-reduced-motion` — transitions removed (`app/globals.css`).

## 5. Reliability / Infrastructure / Hosting
**Scope:** static files on Vercel's CDN; no servers, functions or databases.
- N/A — Load test / autoscaling: static CDN, quiet launch.
- [x] [Critical] Failure modes — every action runs in the browser; browser storage access is wrapped so a blocked storage (private mode) still works (`app/storage.ts`).
- [x] [Critical] Supported versions — Next 16.4.6, React 19.3.1, Node 26.x on Vercel.
- N/A — Timeouts, circuit breakers, multi-region, function sizing: no backend.
- [ ] [Nice-to-have] Vercel spend alert.

## 6. Monitoring & Observability
**Scope:** browser errors and site availability; no server logs.
- [~] [Critical] Error tracking — Sentry project `studio-vinnie/ergane` (EU) created, `@sentry/browser` wired in `app/Telemetry.tsx`, DSN in Vercel production env. Open: turn off IP storage and confirm the new-issue email alert in Sentry; check a test error after the production deploy.
- [ ] [Critical] Uptime monitoring with alerts — chosen, not set up.
- N/A — Centralised server logging: no server; Vercel request logs cover static hits.
- N/A — APM, business alerts: no backend or revenue paths.
- [ ] [Nice-to-have] Health dashboard (Sentry issue list + uptime status page is enough).

## 7. Data / Database / Backups
**Scope: N/A for the server.** No datastore. Visitor data (kits, kerf, machines, materials,
components) lives only in each visitor's browser storage.
- N/A — DB backups, migrations, restore drills: nothing stored server-side.
- [x] [Recommended] Users can back up their own data — kit export (JSON in the ZIP), kit import, share links (`app/KitDrawer.tsx`).
- [ ] [Recommended] Tell users in the app that kits live in this browser only (one line in the drawer or privacy notice).

## 8. Legal & Compliance
**Scope:** EU owner and audience. Personal data processed: IP addresses by Vercel (hosting and
analytics) and Sentry (error reports). No cookies.
- [x] [Critical] Privacy notice — `/privacy` (`app/privacy/page.tsx`), linked from the library rail; contact hello@vinnie.studio; live. Share-link kits are stripped from every URL Sentry and analytics send (`a169ee9`). Its claim that Sentry stores no IP needs the Sentry setting in todo A3.
- [x] [Critical] Licence — code MIT (`LICENSE`); component library, starter kit and design system CC BY-SA 4.0 (`LICENSE-DESIGNS.md`).
- N/A — Consent banner: no cookies or non-essential storage; analytics must be cookieless (Vercel Web Analytics is).
- [~] [Critical] DPAs with processors — Vercel's DPA is part of its terms; Sentry's DPA must be accepted in the dashboard (Settings → Legal & Compliance).
- N/A — DSAR mechanism: no accounts; nothing stored server-side about a person.
- [x] [Recommended] Data minimisation — no accounts, no tracking cookies, share links keep the kit after `#` so it never reaches a server.
- [ ] [Nice-to-have] Legal review of the notice.

## 9. Analytics
- [~] [Recommended] Cookieless analytics — `@vercel/analytics` in the layout; enable Web Analytics in the Vercel project dashboard.
- N/A — Conversion funnels: no signup or payment.
- [x] [Recommended] Export events — `part_export` and `kit_export` tracked (`app/page.tsx`, `app/KitDrawer.tsx`).
- [x] [Nice-to-have] Feedback channel — GitHub issues (once the repo is public).

## 10. DNS / Domain / TLS / Email
**Scope:** `ergane.vinnie.studio` on Cloudflare DNS → Vercel. No email sending.
- [x] [Critical] Custom domain resolves to prod — CNAME to `vercel-dns-016.com`, `vercel domains verify`: configured correctly (2026-11-19).
- [x] [Critical] TLS with auto-renewal — Vercel-managed certificate; HTTPS 200.
- N/A — SPF/DKIM/DMARC, warm-up, unsubscribe: the app sends no email.
- N/A — DNS TTL tuning: Cloudflare automatic TTL; record already live.

## 11. CI/CD & Deployment
**Scope:** Vercel builds remotely; deploys so far via the Vercel CLI from a local checkout.
- [ ] [Critical] Rollback exercised — a promote was done, `vercel rollback` never tried.
- [~] [Critical] Repeatable builds — Vercel builds from source on every deploy (no local prod builds); not yet tied to git, so a deploy can ship uncommitted files.
- [x] [Recommended] Git integration — github.com/VincentPeters/ergane connected to Vercel; production from `main`, previews per pull request; CI required on pull requests by the `main` ruleset.
- [ ] [Recommended] Tests as a release gate — 97 Vitest tests pass locally; nothing runs them in CI.
- [ ] [Nice-to-have] Launch timing — avoid a Friday announcement.

## 12. Testing & QA
- [~] [Critical] End-to-end check of critical paths — part editor, export (SVG/DXF/PDF), coupon, kit drawer, kit export ZIP and share links checked in a browser during development (Playwright, 2026-11-19), not scripted.
- [~] [Critical] Cross-browser + mobile — Chromium desktop and 390 px mobile checked; Firefox and Safari not.
- [ ] [Critical] Physical acceptance tests (spec 13/17) — cut a coupon and a box, check bolt/axle fit and Technic/Meccano alignment; open exports in LightBurn, Inkscape, Illustrator.
- [x] [Recommended] Broken links — single page, no outbound links; `/icon.svg` 200.
- [~] [Recommended] Error pages — Next.js default 404 works (live check); not styled in the app's design.
- [ ] [Recommended] Proofread UI copy.

## 13. Documentation & Operational Readiness
**Scope:** one maintainer.
- [x] [Critical] Incident plan — "When something breaks" in `README.md`.
- [x] [Critical] Runbook — `README.md`: develop, deploy, environment, DNS, rollback, storage keys.
- [x] [Recommended] Architecture docs — `README.md`, `docs/specs.md` (v0.3), `PRODUCT.md`, `DESIGN.md`.
- [x] [Recommended] Support channel — GitHub issues with bug and part-request forms, linked from the app ("Report a problem"); security via private vulnerability reporting (`SECURITY.md`).
- [ ] [Recommended] Launch-day post for the maker communities.
- [ ] [Nice-to-have] Review this checklist after launch.

## Out of scope (N/A summary)
- Security: authn/authz, OAuth, buckets, encryption at rest, WAF/rate limits — no accounts, endpoints or storage.
- Reliability: load tests, autoscaling, failover, function tuning — static CDN.
- Monitoring: server logs, APM, revenue alerts — no backend or revenue.
- Data: backups, migrations, restore drills — nothing stored server-side.
- Legal: consent banner (no cookies), DSAR (no accounts).
- Analytics: funnels (no signup/payment).
- DNS/email: SPF/DKIM/DMARC and email warm-up — no email sent.
