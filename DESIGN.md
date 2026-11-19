---
name: Cutgrid
description: Laser cut construction kit generator on one shared hole grid, charted like a star atlas.
colors:
  chart-navy: "#0f1a33"
  navy-raised: "#13203d"
  plate-field: "#0c1630"
  hairline: "#22325a"
  chalk: "#f2efe6"
  chalk-dim: "#c9c6bd"
  text-secondary: "#b3b8c6"
  mute: "#8e98b3"
  flashlight-amber: "#e8a24a"
  coordinate-grid: "#5a6f99"
  fault-red: "#ef6a60"
  part-fill: "rgba(242, 239, 230, 0.04)"
  laser-preview-outer: "#ff6a5c"
  laser-preview-inner: "#4fdc8c"
  laser-preview-engrave: "#8fa8ff"
  export-outer-cut: "#FF0000"
  export-inner-cut: "#00FF00"
  export-engrave: "#0000FF"
typography:
  display:
    fontFamily: "Spectral, Georgia, serif"
    fontSize: "26px"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "0em"
  headline:
    fontFamily: "Spectral, Georgia, serif"
    fontSize: "17px"
    fontWeight: 300
    lineHeight: 1.45
  title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  body-sm:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0.04em"
    fontFeature: "tnum"
rounded:
  sm: "6px"
  plate: "8px"
  pill: "9px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.chart-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "#ffffff"
    textColor: "{colors.chart-navy}"
  button-primary-disabled:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.mute}"
  button-link:
    textColor: "{colors.flashlight-amber}"
    typography: "{typography.body}"
    padding: "6px 4px"
  input-field:
    backgroundColor: "{colors.navy-raised}"
    textColor: "{colors.chalk}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "32px"
  library-item:
    textColor: "{colors.chalk-dim}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  library-item-selected:
    backgroundColor: "{colors.navy-raised}"
    textColor: "{colors.chalk}"
  segmented-option:
    textColor: "{colors.text-secondary}"
    padding: "0 12px"
    height: "30px"
  segmented-option-selected:
    backgroundColor: "{colors.navy-raised}"
    textColor: "{colors.chalk}"
  chart-plate:
    backgroundColor: "{colors.plate-field}"
    rounded: "{rounded.plate}"
---

# Design System: Cutgrid

## Overview

**Creative North Star: "Ergane's Atlas"**

The kit is charted like a sky. Every surface sits on chart navy, and the chart plate is the light source: parts are plotted in chalk, holes are magnitude dots, the outline is the line joining them, and Athena Ergane's owl, patron of craftspeople, is engraved faintly beneath the field the way a star atlas sets its constellation figure under the stars. Dark is a world choice, not a theme toggle.

The system is an operating tool for makers standing next to a laser. Density is moderate and steady: a fixed shell of hairline-divided columns, tabular figures for every value, and annotation in red-flashlight amber so the numbers read like a chart's measurements. Ornament lives only in the plate; the shell around it stays quiet. What the screen plots is what the laser cuts, in real millimetres.

The world refuses the grey CAD inspector with a white canvas.

**Key Characteristics:**
- Chart navy ground across shell and work area; chalk for parts and text.
- Flashlight amber for annotation, selection and focus; red only for failed rules.
- Spectral light italic names things; Public Sans with tabular figures carries every value.
- Hairline borders, 6 px radii, no drop shadows.
- One authored motion: the Laser colours re-ink.

## Colors

A night-chart palette: deep blue-navy grounds, warm chalk ink, one amber flashlight, and red held back for faults.

### Primary
- **Flashlight Amber** (#e8a24a): dimension annotations and leaders, the dashed selection ring, focus outlines, caret, selected states, the Calibrate link and the rule-status lamp. It is the reader's light on the chart, never fill for large areas.

### Neutral
- **Chart Navy** (#0f1a33): page and shell ground; also the browser theme colour.
- **Navy Raised** (#13203d): inputs, selected library items and segmented options.
- **Plate Field** (#0c1630): the chart plate interior, one step deeper than the shell.
- **Hairline** (#22325a): every border and divider; disabled button fill; switch track.
- **Chalk** (#f2efe6): primary text, part outlines, magnitude dots, the primary button.
- **Chalk Dim** (#c9c6bd): secondary readable text, engrave strokes in the plotted view, unselected list items.
- **Text Secondary** (#b3b8c6): section names, meta lines, definition terms.
- **Mute** (#8e98b3): units, hints, ruler numerals, legend, uppercase field labels.
- **Coordinate Grid** (#5a6f99): pitch gridlines (drawn at 0.45 opacity) and ruler ticks; hover border on fields.
- **Part Fill** (chalk at 4%): the faint body of an outer outline in the plotted view.

### Tertiary (state and machine colours)
- **Fault Red** (#ef6a60): failed rules only. Failing webs are drawn on the plot in this colour, with the shortfall label, and the status list turns red.
- **Laser Preview** (#ff6a5c outer, #4fdc8c inner, #8fa8ff engrave): on-screen cut-layer inks, used only while the Laser colours switch is on.
- **Export Layers** (#FF0000 outer cut, #00FF00 inner cut, #0000FF engrave): written into the exported file only.

### Named Rules
**The Machine Truth Rule.** Export colours are pure #FF0000 / #00FF00 / #0000FF and are never themed, tinted or adjusted. The screen shows lightened stand-ins only when Laser colours is on; the file always carries the pure values.

**The Red Means Fault Rule.** Fault Red appears only when a rule fails. It is never decoration, never a hover, never an accent.

**The One Flashlight Rule.** Amber is the only accent. Selection, focus and annotation share it; nothing else competes.

## Typography

**Display Font:** Spectral, light italic (with Georgia, serif)
**Body Font:** Public Sans 400/500/600 (with system-ui, sans-serif)

**Character:** Spectral light italic is the atlas engraver's hand that names plates and sections; Public Sans is the instrument readout. Numerals are tabular everywhere, set on the body.

### Hierarchy
- **Display** (Spectral italic 300, 26px, 1.1): the part title on the stage bar ("Strip, 11 holes").
- **Headline** (Spectral italic 300, 17px): section names in the library rail and parameter column (Structural, Parameters, Measured, Calibrate kerf).
- **Title** (Public Sans 600, 16px): the wordmark in the top bar.
- **Body** (Public Sans 400, 14px, 1.45, tabular): values, fields, list items, rule copy. Measured values in chalk, terms in Text Secondary.
- **Body small** (Public Sans 400, 13px, 1.45, tabular): secondary lines beside a value: the part meta line, kerf unit, segmented and switch labels, rule lists, coupon note.
- **Label** (Public Sans 400, 12px, 0.04em, uppercase): inline labels for top-bar controls only (Grid, Material, Kerf, Fit). Hints, units and legend use 12px without uppercase.

### Named Rules
**The Two Hands Rule.** Spectral italic names; Public Sans measures. A value is never set in Spectral, except the italic hole-diameter callout on the plate.

**The Eleven Pixel Floor.** Plate annotations never render below 11 CSS px. The annotation unit grows with the fitted scale until labels reach that size.

## Layout

A fixed three-column instrument shell under a 56px top bar: library rail 228px, chart stage fluid, parameter column 304px, full viewport height, with the kit drawer as a full-width row along the bottom. Columns are divided by hairlines, not gutters or cards. The stage holds a bar (title, meta, Fit / 1:1 segmented control, Laser colours switch) above the plate, which fills the remaining space with 16px by 20px padding.

Below 960px the shell collapses to one column: top bar wraps, the library becomes a horizontal scroller without section names, then the plate (min 420px, up to 70dvh), then parameters, then the drawer with its columns stacked.

The plate itself adapts: when the plate is narrower than 560px it goes compact, dropping rulers, leaders, the pitch note and the owl figure, and keeps outline, holes, overall dimensions and faults.

Spacing runs on 6 / 8 / 12 / 16 / 20px; form rows hold a 40px minimum height for gloved hands.

## Elevation & Depth

Flat. There are no drop shadows anywhere. Depth comes from tonal steps: Plate Field sits one step deeper than Chart Navy, and Navy Raised lifts inputs and selections one step above. Where box-shadow appears it is a zero-blur hairline ring (the amber inset on a selected library item, the ring around the legend's hole dot), functioning as a stroke.

### Named Rules
**The Flat Chart Rule.** No blurred shadows. Separation is a hairline or a tonal step, never a lift.

## Shapes

Gently rounded rectangles (6px) for controls, a slightly softer 8px for the chart plate, a 9px pill for the switch track. Borders are 1px hairlines. Inside the plate the geometry is the part's own: hairline strokes held at constant width (non-scaling), dashed amber selection ring (5 / 4), dotted chalk constellation line joining holes (2 / 3), circular magnitude dots.

## Components

### Buttons
Quiet and certain: one chalk button per screen, everything else text or segmented.
- **Shape:** gently rounded (6px), 34px tall.
- **Primary:** chalk fill, navy text, Public Sans 600 14px, 16px side padding. Used for Export.
- **Hover / Focus:** fill brightens by 6% (brightness filter, no extra colour); focus is a 2px amber outline, 2px offset.
- **Disabled:** Hairline fill, Mute text, not-allowed cursor. Export disables when a rule fails.
- **Link:** amber text, no chrome, underline on hover (3px offset). Used for Calibrate and row actions (Edit, Remove).
- **Ghost:** Navy Raised fill, Hairline border, Chalk Dim body-small text, 32px tall; border shifts to Coordinate Grid on hover. Every secondary action (Add to kit, kit actions, Save machine or material). A file picker hides its input inside a ghost button.

### Segmented control
- **Style:** hairline-bordered group, 30px options divided by hairlines; selected option takes Navy Raised and chalk text. Used for Fit / 1:1.

### Switch
- **Style:** 30 by 18px Hairline track with a Mute knob; on, the track tints amber at 35% and the knob slides 12px and turns amber (200ms, cubic-bezier(0.16,1,0.3,1)).

### Inputs / Fields
- **Style:** Navy Raised fill, Hairline border, 6px radius, 32px tall, chalk text. Numbers right-aligned in a 72px field. Selects carry a drawn chevron in Mute.
- **Focus:** 2px amber outline, 2px offset; caret amber.
- **Hover:** border shifts to Coordinate Grid.

### Library rail items
- **Style:** full-width 34px rows, transparent, Chalk Dim text with a 12px Mute count on the right.
- **Hover:** Navy Raised fill, chalk text.
- **Selected:** Navy Raised fill with a 1px amber inset ring.

### Coupon label chips
- **Style:** four-column grid of 36px Navy Raised tiles with hairline border (five columns for the five press-fit slots).
- **Selected:** amber border and text over an 8% amber wash.

### Chart plate (signature)
The work area is a star-atlas plate on Plate Field with an 8px radius and hairline border.
- **Plot:** outline and holes in chalk; holes carry a chalk magnitude dot whose radius is half the hole radius, so dots grow with hole diameter; a dotted constellation line joins the holes.
- **Grid and rulers:** pitch gridlines through hole centres; mm rulers in Mute.
- **Annotations:** amber dimension lines, leaders and the pitch note; the hole diameter in Spectral italic.
- **Faults:** failing webs drawn on the plot in Fault Red with end dots and the shortfall value.
- **Figure:** the Ergane owl, engraved in hairlines at 0.09 opacity, anchored to the plate centre beneath the plot. Absent on the coupon and on compact plates.
- **Legend:** bottom row, 12px Mute, with the live scale readout right-aligned.
- **Laser colours (the one motion moment):** the same paths re-ink from chalk to cut-layer preview colours, the magnitude dots shrink and fade away, all over 320ms cubic-bezier(0.16,1,0.3,1). Reduced motion removes the transition.

### Kit drawer
The bottom row of the shell; the bar is always visible, the body opens below it.
- **Bar:** 48px; a ghost Kit toggle with a drawn chevron, the kit name in Public Sans 600, a body-small meta line (lines, pieces, sheets, sheet size), a Fault Red count of blocked lines, a right-aligned status notice, and the chalk Export kit button.
- **Body:** 300px, three scrolling columns: the parts table, sheet thumbnails, and kit actions with the Material and Machine editors as hairline-topped fieldsets with Spectral italic legends.
- **Parts table:** body-small rows on hairlines, Mute part IDs (P01 …), a 56px quantity field, Edit and Remove links; a blocked line turns Fault Red and carries its rule messages as a tooltip.
- **Sheet thumbnails:** 240px Plate Field tiles at the sheet's aspect ratio, every path in chalk hairlines, captioned "Sheet 01" in Mute.

### Custom grid fields
- When the CUSTOM grid is chosen, a "Custom grid" section with pitch, hole ø and strip width fields leads the parameter column.

### Rule status
- **Style:** below Measured, above a hairline. A ringed amber lamp with "All rules pass" and a passed / total count; on failure the lamp and line turn Fault Red ("Export blocked") and a list states each failure.

## Do's and Don'ts

### Do:
- **Do** keep export layer colours pure #FF0000 / #00FF00 / #0000FF; preview with #ff6a5c / #4fdc8c / #8fa8ff only under the Laser colours switch.
- **Do** hold plate annotations at 11 CSS px or larger; below a 560px plate, drop rulers, leaders and the figure rather than shrink type.
- **Do** draw failing webs on the plot in Fault Red, not only in the side panel.
- **Do** size magnitude dots from the hole diameter (dot radius = 0.5 of hole radius).
- **Do** write rule copy as the problem plus the remedy: what is short, by how much, and what to change ("To fix: ...").
- **Do** set every value in Public Sans with tabular figures and its unit in Mute.
- **Do** keep the owl figure a faint hairline engraving (0.09 opacity) anchored to the plate.

### Don't:
- **Don't** add blurred or offset shadows; separate with hairlines and tonal steps.
- **Don't** theme, tint or restyle the exported file's colours.
- **Don't** use Fault Red for anything but a failed rule.
- **Don't** add a second accent colour or a second animated moment beside the Laser colours re-ink.
- **Don't** show the owl figure on the coupon or a compact plate, or raise it above a faint underlay.
- **Don't** put the screen on a white or grey canvas; the plate is chart navy.
