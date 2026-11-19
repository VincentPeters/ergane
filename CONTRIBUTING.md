# Contributing to Ergane

Thanks for helping. Bug reports with a kit file or share link attached are the most useful thing you can send.

## Set up

Node 22 or later (`.nvmrc`), then:

```sh
npm install
npm run dev     # http://localhost:3000
npm run check   # typecheck, tests and build: what CI runs
```

## Where things live

- `src/core/` is the geometry core: plain TypeScript, no React. Shapes, kerf, validation, nesting and the
  SVG, DXF, PDF and ZIP exporters. Every outline takes a grow distance (half the kerf), so kerf is exact.
- `src/core/components.json` is the mounting library (boards, motors, servos).
- `app/` is the Next.js UI, built as a static export. There is no server code.
- `docs/specs.md` is the specification; `DESIGN.md` is the visual design system.

## Changes

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Branch from `main`, keep the change focused, and add a test in `src/core/*.test.ts` for any
   geometry, validation or export logic.
3. Run `npm run check`. For UI changes, look at the page at desktop width and at 390 px.
4. Open a pull request. Vercel posts a preview link; CI must pass before merge.

Commit messages use the imperative mood and say why, not just what.

## Adding a component to the library

Each entry in `src/core/components.json` gives holes and cutouts in mm, relative to the centre of the
pattern. Measure with calipers where you can and say so in the pull request; datasheet values are fine
when linked. Untrusted JSON is clamped in the core, so a typo cannot crash the app, but it can cut a
wrong hole.

## Licence

By contributing you agree that code is licensed under MIT ([LICENSE](LICENSE)) and designs (components,
starter kit) under CC BY-SA 4.0 ([LICENSE-DESIGNS.md](LICENSE-DESIGNS.md)).
