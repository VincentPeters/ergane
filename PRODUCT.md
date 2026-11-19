# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: hobbyists at home with their own laser cutter. They build projects that mix laser cut parts with Lego Technic or Meccano parts they already own, and they tune fit for their own machine and material. Teachers and maker labs are a secondary audience, not the design target.

## Product Purpose

Ergane generates laser cut files for a Meccano-style construction kit. The user picks a grid standard, a material and an element type; the app draws the part, applies kerf compensation and exports a cut file. Success: every part bolts to every other part, and to existing Technic or Meccano parts, on the first cut after calibration.

## Positioning

One shared hole grid (8 mm Technic pitch, M3 bolts by default) across every part, compatible with parts people already own, with kerf and fit calibrated per machine and material through a cut-and-test coupon. Everything runs in the browser; no file leaves the user's machine.

## Operating Context

- The user sits next to a laser cutter, often in a garage, shed or hobby room, switching between the browser, the laser software (LightBurn, Inkscape, Illustrator, vendor tools) and calipers or test parts in hand.
- First run: pick material, cut the calibration coupon, enter the best-fitting label, then add parts or load the starter kit, then export.
- Output is real-world scale in mm. The preview must match the export exactly.
- Materials: 3 mm cast acrylic (default), plywood, MDF, cardboard.

## Capabilities and Constraints

- Grid profiles GRID8-M3, GRID8-TECHNIC, MECCANO; hole mix on the 8 mm grid; fit classes loose, normal, tight.
- Parametric parts (strips, plates, later angles, joints, boxes, mounting plates, motion parts), engraved single-stroke labels, calibration coupon.
- Export SVG (primary), DXF R12, PDF; machine-neutral layer names and colours (engrave blue, inner cuts green, outer cuts red).
- Validation blocks export and names the failed rule.
- Static Next.js site on Vercel, no backend, no accounts; state lives in the browser, export files and share URLs.
- Terminology: pitch, hole, strip, plate, kerf, fit, web, coupon, kit, sheet.

## Brand Commitments

- The name is Ergane, after Athena Ergane, patron of craftspeople. Tagline: "open construction grid". ("Cutgrid" was the working title and survives in the repository and project names.)
- The brand takes its name from Athena Ergane; no figure is drawn. The mark is abstract: a two-hole strip, the kit's simplest part, tilted 45° with an amber pip at its centre. (An owl mark and engraved owl figure were tried and dropped.)
- Open source and open design are core to the identity: the tool, and the kit designs it produces, are meant to be shared, remixed and built on.

## Evidence on Hand

- Spec: docs/specs.md (v0.3).
- No logo, imagery, users, testimonials or community exist yet. Do not fabricate any.
- License for code and for generated designs is undecided.

## Product Principles

1. The cut is the truth. What the screen shows is what the laser cuts, in real millimetres.
2. Fit beats features. Calibration and validation come before more part types.
3. Compatible by default. Every part shares the grid and works with parts people already own.
4. Open by nature. Designs, kits and the tool itself are made to be shared and remixed; no lock-in, no accounts.
5. Local and private. Geometry runs in the browser; nothing leaves the user's machine.

## Accessibility & Inclusion

No product-specific requirement established beyond WCAG AA basics. Users often work with dusty or gloved hands near a machine, so targets and contrast matter.
