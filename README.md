# Ergane

Ergane generates laser cut files for a Meccano-style construction kit on one shared hole grid
(8 mm Technic pitch with M3 bolts by default). Pick a part, a grid, a material and a fit; Ergane draws it,
compensates for kerf, checks the webs and exports SVG, DXF or PDF. Kits nest by true shape onto sheets.

Live at https://ergane.vinnie.studio.
Everything runs in the browser: no accounts, no backend, no cookies.

- Spec: [docs/specs.md](docs/specs.md) · Design system: [DESIGN.md](DESIGN.md)

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
package name and browser storage keys (`cutgrid.*`) keep it so saved data stays readable.

## Run your own copy

`npm run build` writes a static site to `out/` that any static host can serve; `vercel.json` holds the
security headers used on the live site. Error reporting is off unless `NEXT_PUBLIC_SENTRY_DSN` is set at
build time; visit counting only works when the site is hosted on Vercel with Web Analytics enabled.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bugs and part requests go in
[issues](https://github.com/VincentPeters/ergane/issues); security problems follow [SECURITY.md](SECURITY.md).

## Licence

Code: [MIT](LICENSE). The component library, starter kit and design system:
[CC BY-SA 4.0](LICENSE-DESIGNS.md). Files you export for your own parts are yours.
