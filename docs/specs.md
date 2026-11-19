# Cutgrid: spec for a laser cut construction kit generator

Version 0.2, 19 November 2026. Working title: Cutgrid.

Decisions in this version: 8 mm Technic grid as the base, M3 as the default fastener, 3 mm acrylic as the default material, Next.js as the framework, machine-neutral export.

## 1. Goal

Cutgrid generates laser cut files for a Meccano-style construction kit. You pick a grid standard, a material and an element type. The app draws the part, applies kerf compensation and exports a cut file.

Three outcomes:

- One shared hole grid across all parts, so every part bolts to every other part.
- Compatibility with Lego Technic and Meccano parts you already own.
- A metric default built on M3 bolts on the 8 mm Technic grid.

## 2. Scope

In scope for v1:

- Flat parts cut from sheet material: plywood, MDF, acrylic, cardboard.
- Parametric generators for structural parts and mounting plates.
- Export to SVG, DXF and PDF.
- Sheet layout with several parts on one sheet.
- A calibration coupon to tune hole fit per machine and material.

Out of scope for v1:

- 3D printed parts.
- Machine control or G-code.
- Automatic dense nesting. V1 uses row packing.
- User accounts and cloud storage.

## 3. Grid profiles

A grid profile defines pitch, hole diameter and fastener. Every generator reads these values from the active profile.

| Profile | Pitch | Hole diameter | Fastener | Strip width | Notes |
|---|---|---|---|---|---|
| GRID8-M3 (default) | 8 mm | 3.2 mm | M3 bolt and nut | 8 mm | Technic grid with M3 holes |
| GRID8-TECHNIC | 8 mm | 4.8 mm | Technic pin or axle | 8 mm, see 3.2 | Same grid, Lego hole size |
| MECCANO | 12.7 mm | 4.1 mm | M4 or original Meccano bolt | 12.7 mm | Half inch pitch |
| CUSTOM | user | user | user | user | Free input, saved in the project file |

All diameters are nominal. Section 7 covers kerf and fit correction.

### 3.1 One grid, two hole types

- GRID8-M3 and GRID8-TECHNIC share the 8 mm pitch. Every hole position accepts either hole type.
- Each generator offers a hole mix setting: all M3, all Technic, alternating, or Technic on the border with M3 inside.
- An M3 bolt with a washer also clamps through a Technic hole, so mixed builds work without adapters.
- MECCANO uses a different pitch. The app offers adapter plates: 8 mm grid on one half, 12.7 mm grid on the other half.

### 3.2 Technic constraints with 3 mm acrylic

- A Technic pin needs a hole depth near 8 mm to snap in. One 3 mm sheet holds axles and bolts. Pins pass through but stay loose.
- M3 bolts are the main fastener. Technic holes serve axles, bushings and connections to Lego parts through bolts.
- An 8 mm wide strip with a 4.8 mm hole leaves a 1.6 mm wall. Acrylic cracks at this size. Technic hole strips default to 12 mm width. M3 strips keep 8 mm width with a 2.4 mm wall.
- Optional axle holes: cross shape, 4.8 mm across, 1.8 mm arm width.

### 3.3 Values to verify before release

Measure real parts with calipers and confirm:

- Meccano hole diameter and pitch on an original strip.
- Technic hole diameter on a real beam.
- M3 clearance: 3.2 mm is the normal fit. 3.4 mm is the loose fit.

## 4. Materials

Material presets store thickness, kerf and a recommended minimum web between holes.

| Preset | Thickness | Starting kerf | Min web |
|---|---|---|---|
| Acrylic 3 mm (default) | 3.0 mm | 0.20 mm | 2.0 mm |
| Plywood 3 mm | 3.0 mm | 0.15 mm | 2.5 mm |
| MDF 4 mm | 4.0 mm | 0.20 mm | 2.5 mm |
| Cardboard | 3.8 mm | 0.30 mm | 5.0 mm |

Acrylic notes:

- Use cast acrylic. Extruded acrylic cracks sooner around bolt holes.
- Sheet thickness varies per batch. The material preset stores the measured thickness for tab and slot joints.
- Tight fit holes stress the material. Acrylic defaults to normal fit.

Kerf values are starting points. The calibration coupon in section 7 replaces them with measured values. Users add their own presets.

## 5. Element types

Every element is a parametric generator. Lengths count in grid units (holes), never in millimetres, unless stated.

### 5.1 Structural parts

| Element | Parameters | Description |
|---|---|---|
| Strip | holes (2 to 50), rows (1 to 3) | Straight beam with rounded ends |
| Slotted strip | holes, slot length | Strip with one or more slots for adjustable mounting |
| Plate | columns, rows, corner radius, hole pattern (full, border, checker) | Rectangular plate |
| Angle strip | holes arm A, holes arm B, angle (45, 60, 90, 120, 135) | Flat L or V shape |
| Triangle gusset | holes per side | Corner brace |
| Frame | outer columns, outer rows, border width | Open rectangle |
| T, X, H, Y connectors | arm lengths | Flat junction parts |
| Disc | diameter in units, hole circle count | Round plate with centre hole |
| Curved strip | radius, arc angle | Arc with holes on the centre line |

### 5.2 Joints for 3D builds

Flat sheet needs corner joints. The app generates:

| Element | Parameters | Description |
|---|---|---|
| Tab and slot edge | tab count, tab width | Finger joint along a plate edge. Tab depth equals material thickness |
| Captive nut joint | bolt size (M3 default) | T-slot for a nut plus a bolt hole in the mating plate. M3 nut: 5.5 mm across flats, 2.4 mm thick |
| Corner bracket | holes per leg | Two plates joined by tabs to form a 90 degree bracket |
| Box | columns, rows, height, lid type | Six plates with finger joints and grid holes on every face |
| Spacer | outer diameter, hole diameter, quantity | Stackable rings to set height |

### 5.3 Mounting plates

A mounting plate carries grid holes on the border and a component hole pattern in the centre. Component patterns live in a library file (JSON), so adding a board needs no code change.

The first library covers the common classroom and hobby parts below. Users add more through a form or a JSON import.

Starter library. Confirm every pattern against the datasheet before release:

| Component | Pattern | Fastener |
|---|---|---|
| Arduino UNO | 4 holes, irregular | M3 |
| Raspberry Pi 3, 4, 5 | 58 x 49 mm rectangle | M2.5 |
| Raspberry Pi Pico | 11.4 x 47 mm rectangle | M2 |
| ESP32 DevKit | parametric rectangle, varies per maker | M2.5 or M3 |
| NEMA 17 stepper | 31 x 31 mm square, 22 mm centre bore | M3 |
| SG90 micro servo | body cutout near 23 x 12.5 mm, 2 screw holes | M2 |
| Half size breadboard | outline with adhesive area, no holes | none |
| TT gear motor | 2 holes plus shaft clearance | M3 |
| 18650 or AA holder | 2 holes, parametric | M3 |
| Generic rectangle | width, height, hole diameter | user |

### 5.4 Motion parts, v2

- Spur gears with a tooth count and module input.
- Wheels with tyre groove.
- Pulleys for GT2 belt.
- Rack strips.

## 6. Shared parameters

Every element accepts:

- Grid profile.
- Material preset.
- Fit class: loose, normal, tight. See section 7.
- Edge margin: distance from the outer hole centre to the edge. Default is half a pitch.
- Corner radius.
- Label: engraved text such as the hole count or a part ID. Toggle on or off.
- Quantity.

Validation rules:

- The web between two holes stays above the material minimum.
- The web between a hole and the edge stays above the material minimum.
- A part fits inside the selected sheet size.
- The app blocks export on a failed rule and names the rule.

## 7. Kerf and fit

The laser removes material. Without correction, holes come out too large and parts too small.

- Outer contours shift outward by half the kerf.
- Holes and inner cutouts shift inward by half the kerf.
- Fit class adds an offset to hole diameter: loose +0.2 mm, normal 0, tight -0.1 mm.
- Slots for tab joints use material thickness minus a press fit value. Default 0.1 mm.

Calibration coupon:

- A small test strip with 7 holes per profile, each 0.05 mm apart in diameter, plus 5 slots in steps of 0.05 mm.
- Each feature carries an engraved label.
- The user cuts the coupon, tests a bolt or pin in each hole and enters the best label. The app stores the result as kerf for the machine and material pair.

## 8. Output

Formats:

- SVG, the primary format. Units in mm. Stroke width 0.01 mm (hairline).
- DXF R12 for older laser software.
- PDF for print preview and documentation.

Layer and colour convention, configurable per machine profile:

| Operation | Colour | Order |
|---|---|---|
| Engrave (labels) | Blue #0000FF | 1 |
| Inner cuts (holes, slots) | Green #00FF00 | 2 |
| Outer cuts | Red #FF0000 | 3 |

Inner cuts run before outer cuts so parts stay in place during hole cutting.

Machine-neutral export. The app targets no specific laser:

- The three colours above are the default. Users remap colours in a machine profile and save the profile.
- SVG groups and DXF layers carry plain names: engrave, cut-inner, cut-outer. Software without colour mapping reads the layer names.
- Option: one file per operation, for software with no layer or colour support.
- Option: a single-colour file with all paths, for machines where the operator sets the order by hand.
- All files use mm units and real-world scale, with a 10 mm reference square on request to check import scale.

Sheet layout:

- User sets sheet size. Presets: 300 x 200, 600 x 300, 600 x 400, 900 x 600 mm.
- Part spacing default 2 mm.
- Row packing in v1. Parts sort by height.
- The app splits a kit over several sheets and numbers each file.
- Export also produces a parts list in CSV: part ID, type, parameters, quantity.

## 9. Kits

A kit is a saved list of parts with quantities.

- Built-in starter kit: strips of 3, 5, 7, 11 and 15 holes, plates of 5 x 5 and 5 x 11, 8 angle strips, 8 gussets, 20 spacers, one Arduino UNO plate.
- Users save, duplicate and edit kits.
- A kit exports as one JSON file. A shared link encodes the same JSON in the URL.

## 10. User interface

One screen, three columns:

- Left: element library, grouped as in section 5.
- Centre: live preview at true scale, with zoom, a ruler and a hole count overlay.
- Right: parameter form for the selected element, plus validation messages.

Top bar: grid profile, material preset, machine profile, export button.

Bottom drawer: the current kit as a list with quantities and a sheet layout preview.

Flow for a first-time user:

1. Pick a material preset.
2. Cut the calibration coupon and enter the result.
3. Add parts or load the starter kit.
4. Export.

## 11. Architecture

Next.js with TypeScript, exported as a static site. No backend, no accounts. Anyone opens the URL and exports files.

- Next.js App Router with static export. Hosting on any static host.
- All geometry runs in the browser. No file leaves the user's machine.
- Geometry core as a separate TypeScript package with no React dependency. Input: element definition plus profile, material and fit. Output: a list of closed paths, each tagged engrave, inner or outer.
- Offsetting through a polygon clipping library (Clipper2 port).
- Exporters for SVG, DXF and PDF consume the same path list.
- Preview rendered as inline SVG from the same path list, so preview and export always match.
- State stored in the browser (local storage), in export files and in shareable URLs.
- Unit tests on the geometry core with Vitest.
- A command line wrapper around the geometry core for batch generation, later.

## 12. Data model

```json
{
  "profile": { "id": "GRID8-M3", "pitch": 8, "hole": 3.2, "width": 8 },
  "holeMix": "all-m3",
  "material": { "id": "acrylic3", "thickness": 3.0, "kerf": 0.20, "minWeb": 2.0 },
  "fit": "normal",
  "parts": [
    { "type": "strip", "holes": 11, "rows": 1, "qty": 4, "label": true },
    { "type": "plate", "cols": 5, "rows": 11, "pattern": "full", "qty": 2 },
    { "type": "mount", "component": "arduino-uno", "border": 1, "qty": 1 }
  ],
  "sheet": { "width": 600, "height": 300, "spacing": 2 }
}
```

Component library entry:

```json
{
  "id": "nema17",
  "name": "NEMA 17 stepper",
  "holes": [
    { "x": -15.5, "y": -15.5, "d": 3.2 },
    { "x": 15.5, "y": -15.5, "d": 3.2 },
    { "x": -15.5, "y": 15.5, "d": 3.2 },
    { "x": 15.5, "y": 15.5, "d": 3.2 }
  ],
  "cutouts": [ { "shape": "circle", "x": 0, "y": 0, "d": 22.5 } ]
}
```

## 13. Acceptance criteria

- An 11-hole GRID8-M3 strip measures 88 mm long and 8 mm wide after cutting, within 0.2 mm.
- An M3 bolt passes through every hole of a normal fit part without force.
- A GRID8 plate lines up hole for hole with a Lego Technic beam across 11 holes.
- A Technic axle fits a GRID8-TECHNIC hole without play above 0.2 mm.
- A MECCANO profile strip bolts to an original Meccano strip across 5 holes.
- SVG files open in LightBurn, Inkscape and Illustrator at correct scale with correct layer colours.
- Export of the starter kit takes under 2 seconds in the browser.
- Every validation rule in section 6 has an automated test.

## 14. Milestones

| Phase | Content |
|---|---|
| M1 | Next.js project, geometry core, strip and plate, GRID8-M3 profile, SVG export, kerf compensation |
| M2 | Calibration coupon, material presets, GRID8-TECHNIC and MECCANO profiles, hole mix, validation |
| M3 | Remaining structural parts, joints, box generator |
| M4 | Mounting plate library, hybrid and adapter plates |
| M5 | Kits, sheet layout, DXF and PDF export, parts list |
| M6 | Motion parts |

## 15. Open questions

1. Strip width for Technic hole strips in acrylic: 12 mm is a proposal. Cut a test strip at 8, 10 and 12 mm and check for cracks.
2. Keep MECCANO in v1 or move the profile to a later phase. The 8 mm grid covers most builds.
3. Hosting location and public name for the app.
4. Extra components for the library beyond the starter list in 5.3.