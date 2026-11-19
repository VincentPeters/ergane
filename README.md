# Ergane

Ergane generates laser cut files for a Meccano-style construction kit on one shared hole grid
(8 mm Technic pitch with M3 bolts by default). Pick a part, a grid, a material and a fit; Ergane draws it,
compensates for kerf, checks the webs and exports SVG, DXF or PDF. Kits nest by true shape onto sheets.

Live at https://ergane.vinnie.studio (also https://cut-grid.vercel.app).
Everything runs in the browser: no accounts, no backend, no cookies.

- Spec: [docs/specs.md](docs/specs.md) · Product: [PRODUCT.md](PRODUCT.md) · Design system: [DESIGN.md](DESIGN.md)
- Launch status: [docs/launch-checklist/checklist.md](docs/launch-checklist/checklist.md)

## Develop

```sh
npm install
npm run dev      # http://localhost:3000
npm test         # Vitest: geometry, kerf, validation, nesting, exporters
npm run build    # static export to out/
npm run check    # typecheck + tests + build, the same as CI
```

`src/core/` is the geometry core: plain TypeScript with no React, shared by the UI and the exporters.
`app/` is the Next.js UI (static export). The name was Cutgrid during development; the repository folder,
package name, Vercel project and browser storage keys (`cutgrid.*`) keep it so saved data stays readable.

## Deploy

Hosted on Vercel, project `cut-grid` in the `vincentpeters-projects` team, connected to this repository:

- a push to `main` deploys production;
- every pull request gets a preview deployment, and CI (`.github/workflows/ci.yml`) must pass before merge.

`main` allows no force pushes or deletion; changes from others arrive through pull requests.
Manual deploys still work after `vercel link --yes --scope vincentpeters-projects`:
`vercel deploy` (preview, behind Vercel login) or `vercel deploy --prod`.

Production environment variables: `NEXT_PUBLIC_SENTRY_DSN` (Sentry project `studio-vinnie/ergane`, EU region).
Without it, builds report no errors, which is what local builds and forks should do.

Domain: `ergane.vinnie.studio` is a Cloudflare DNS record `CNAME ergane → 9fb6b9fb65d45ff7.vercel-dns-016.com`,
proxy off (DNS only), so Vercel issues and renews the certificate. Security headers live in `vercel.json`.

## Roll back

```sh
vercel ls cut-grid --scope vincentpeters-projects          # find the last good production deployment
vercel rollback <good-deployment-url> --scope vincentpeters-projects
```

Rollback switches production instantly and pauses automatic promotion. When the fix is ready, deploy it and
run `vercel promote <new-deployment-url> --scope vincentpeters-projects` to resume.

## When something breaks

1. **Notice.** Alerts arrive by email: the uptime monitor (site down) and Sentry (new error in the browser).
2. **Judge.** Site down or the core flow broken (edit a part, export, kit export)? Roll back first, investigate after.
   A rare error in an edge case can wait for a normal fix.
3. **Roll back** with the commands above and check https://ergane.vinnie.studio.
4. **Tell users** on the GitHub repository (an issue or a pinned note) if the outage was visible.
5. **Fix** on a branch, check the preview, deploy, and note what happened in the issue.

Nothing is stored server-side, so there is never data to restore: visitors' kits live in their own browsers.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bugs and part requests go in
[issues](https://github.com/VincentPeters/ergane/issues); security problems follow [SECURITY.md](SECURITY.md).

## Licence

Code: [MIT](LICENSE). The component library, starter kit and design system:
[CC BY-SA 4.0](LICENSE-DESIGNS.md). Files you export for your own parts are yours.
