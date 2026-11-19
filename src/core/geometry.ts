// Geometry core. Plain TypeScript, no React: the UI, exporters and a future CLI share it.
// Units are mm. Coordinates follow SVG: x right, y down, origin at the nominal outline's top-left.
import { text, textWidth } from './font'

export type Op = 'engrave' | 'inner' | 'outer'
export type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'poly'; pts: [number, number][] } // closed, arcs flattened
  | { kind: 'line'; pts: [number, number][] } // open, engrave strokes
export type Path = { op: Op; shape: Shape }

// Nominal hole sizes and the strip width each needs. See spec 3.2 for the 12 mm Technic width.
export type HoleType = 'm3' | 'technic' | 'meccano'
export const HOLES: Record<HoleType, { name: string; short: string; d: number; width: number }> = {
  m3: { name: 'M3', short: 'M3', d: 3.2, width: 8 },
  technic: { name: 'Technic', short: 'TEC', d: 4.8, width: 12 },
  meccano: { name: 'Meccano', short: 'MEC', d: 4.1, width: 12.7 },
}

// Mixable profiles share the 8 mm grid, so any hole position takes either hole type.
export type Profile = { id: string; pitch: number; hole: HoleType; mixable: boolean }
export const PROFILES: Profile[] = [
  { id: 'GRID8-M3', pitch: 8, hole: 'm3', mixable: true },
  { id: 'GRID8-TECHNIC', pitch: 8, hole: 'technic', mixable: true },
  { id: 'MECCANO', pitch: 12.7, hole: 'meccano', mixable: false },
]

export type HoleMix = 'all-m3' | 'all-technic' | 'alternating' | 'border-technic'
export const defaultMix = (p: Profile): HoleMix => (p.hole === 'technic' ? 'all-technic' : 'all-m3')

export type Material = { id: string; name: string; thickness: number; kerf: number; minWeb: number }
export const MATERIALS: Material[] = [
  { id: 'acrylic3', name: 'Acrylic 3 mm', thickness: 3.0, kerf: 0.2, minWeb: 2.0 },
  { id: 'plywood3', name: 'Plywood 3 mm', thickness: 3.0, kerf: 0.15, minWeb: 2.5 },
  { id: 'mdf4', name: 'MDF 4 mm', thickness: 4.0, kerf: 0.2, minWeb: 2.5 },
  { id: 'cardboard', name: 'Cardboard', thickness: 3.8, kerf: 0.3, minWeb: 5.0 },
]

export type Fit = 'loose' | 'normal' | 'tight'
export const FIT_OFFSET: Record<Fit, number> = { loose: 0.2, normal: 0, tight: -0.1 }

export type Pattern = 'full' | 'border' | 'checker'
export type Part =
  | { type: 'strip'; holes: number; rows: number; label?: boolean }
  | { type: 'plate'; cols: number; rows: number; pattern: Pattern; radius: number; label?: boolean }
  | { type: 'coupon' }
type GridPart = Exclude<Part, { type: 'coupon' }>

export type Ctx = { profile: Profile; material: Material; fit: Fit; holeMix?: HoleMix }

type Hole = { x: number; y: number; i: number; j: number; type: HoleType }
type Layout = { w: number; h: number; r: number; holes: Hole[] }

// Nominal part before any fit or kerf correction.
function layout(part: GridPart, ctx: Ctx): Layout {
  const { pitch } = ctx.profile
  const cols = part.type === 'strip' ? part.holes : part.cols
  const rows = part.rows
  const mix = ctx.profile.mixable ? (ctx.holeMix ?? defaultMix(ctx.profile)) : null
  const typeAt = (i: number, j: number): HoleType => {
    if (!mix) return ctx.profile.hole
    const border = i === 0 || j === 0 || i === cols - 1 || j === rows - 1
    if (mix === 'alternating') return (i + j) % 2 ? 'm3' : 'technic'
    if (mix === 'border-technic') return border ? 'technic' : 'm3'
    return mix === 'all-technic' ? 'technic' : 'm3'
  }
  const keep = (i: number, j: number) =>
    part.type === 'strip' || part.pattern === 'full' ? true
    : part.pattern === 'border' ? i === 0 || j === 0 || i === cols - 1 || j === rows - 1
    : (i + j) % 2 === 0
  const grid: { i: number; j: number; type: HoleType }[] = []
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) if (keep(i, j)) grid.push({ i, j, type: typeAt(i, j) })
  // The widest hole type in use sets the strip width; edge margin is half of it.
  const m = Math.max(...grid.map((g) => HOLES[g.type].width)) / 2
  return {
    w: (cols - 1) * pitch + 2 * m,
    h: (rows - 1) * pitch + 2 * m,
    r: part.type === 'strip' ? m : part.radius,
    holes: grid.map((g) => ({ ...g, x: m + g.i * pitch, y: m + g.j * pitch })),
  }
}

// Correction order: nominal diameter -> fit class offset -> kerf.
// Holes shrink by half the kerf, outer contours grow by half the kerf.
export function holeRadius(nominal: number, fit: Fit, kerf: number) {
  return (nominal + FIT_OFFSET[fit]) / 2 - kerf / 2
}

const outline = (w: number, h: number, r: number, kerf: number): Path => {
  const k = kerf / 2
  return { op: 'outer', shape: { kind: 'poly', pts: roundedRect(-k, -k, w + 2 * k, h + 2 * k, r + k) } }
}
const engrave = (s: string, cx: number, cy: number, h: number): Path[] =>
  text(s, cx, cy, h).map((pts) => ({ op: 'engrave', shape: { kind: 'line', pts } }))

export function generate(part: Part, ctx: Ctx): Path[] {
  if (part.type === 'coupon') return coupon(ctx)
  const L = layout(part, ctx)
  const kerf = ctx.material.kerf
  const paths: Path[] = L.holes.map((h) => ({
    op: 'inner',
    shape: { kind: 'circle', cx: h.x, cy: h.y, r: holeRadius(HOLES[h.type].d, ctx.fit, kerf) },
  }))
  if (part.label) paths.push(...label(part, L, ctx))
  paths.push(outline(L.w, L.h, L.r, kerf))
  return paths
}

const LABEL_H = 2.5 // max cap height, mm
const LABEL_CLEAR = 0.4 // gap between text and hole edge, mm

// Engraved between the first two holes of the first row, shrunk to fit the gap. Skipped below 1 mm.
function label(part: GridPart, L: Layout, ctx: Ctx): Path[] {
  const s = part.type === 'strip' ? String(part.holes) : `${part.cols}x${part.rows}`
  const [a, b] = L.holes
  if (!b || b.j !== 0) return []
  const gap = b.x - a.x - (HOLES[a.type].d + HOLES[b.type].d) / 2 - 2 * LABEL_CLEAR
  const h = Math.min(LABEL_H, (LABEL_H * gap) / textWidth(s, LABEL_H))
  return h < 1 ? [] : engrave(s, (a.x + b.x) / 2, a.y, h)
}

// Calibration coupon: 7 holes per hole type, each cut with a candidate kerf 0.05 mm apart.
// The engraved label is that kerf, so the best-fitting hole's label is the value to enter.
export const COUPON_STEP = 0.05
export function couponKerfs(kerf: number) {
  const base = Math.max(kerf, 3 * COUPON_STEP) // keep the smallest candidate at 0 or above
  return [-3, -2, -1, 0, 1, 2, 3].map((n) => +(base + n * COUPON_STEP).toFixed(2))
}

function coupon(ctx: Ctx): Path[] {
  const types: HoleType[] = ctx.profile.mixable ? ['m3', 'technic'] : [ctx.profile.hole]
  const kerfs = couponKerfs(ctx.material.kerf)
  const gutter = 12, col = 10, row = 16, top = 6
  const paths: Path[] = []
  types.forEach((t, r) => {
    const y = top + r * row
    paths.push(...engrave(HOLES[t].short, gutter / 2 + 1, y, 2.5))
    kerfs.forEach((k, c) => {
      const x = gutter + 5 + c * col
      paths.push({ op: 'inner', shape: { kind: 'circle', cx: x, cy: y, r: holeRadius(HOLES[t].d, 'normal', k) } })
      paths.push(...engrave(k.toFixed(2), x, y + 5.5, 2.5))
    })
  })
  paths.push(outline(gutter + 5 + 6 * col + 6, top + (types.length - 1) * row + 9, 3, ctx.material.kerf))
  return paths
}

export type Issue = { rule: 'hole-web' | 'edge-web'; message: string }

// Webs are measured on the hole as cut (nominal + fit); kerf correction cancels out after cutting.
export function validate(part: Part, ctx: Ctx): Issue[] {
  if (part.type === 'coupon') return []
  const L = layout(part, ctx)
  const dia = (h: Hole) => HOLES[h.type].d + FIT_OFFSET[ctx.fit]
  const min = ctx.material.minWeb
  const at = new Map(L.holes.map((h) => [`${h.i},${h.j}`, h]))
  let holeWeb = Infinity
  let edgeWeb = Infinity
  for (const h of L.holes) {
    // Nearest holes on a grid are the four forward neighbours (diagonals matter for checker).
    for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const n = at.get(`${h.i + di},${h.j + dj}`)
      if (n) holeWeb = Math.min(holeWeb, Math.hypot(n.x - h.x, n.y - h.y) - (dia(h) + dia(n)) / 2)
    }
    edgeWeb = Math.min(edgeWeb, -sdRoundRect(h.x, h.y, L.w, L.h, L.r) - dia(h) / 2)
  }
  const issues: Issue[] = []
  const name = ctx.material.name
  if (holeWeb < min)
    issues.push({ rule: 'hole-web', message: `Web between holes is ${holeWeb.toFixed(2)} mm, below the ${min} mm minimum for ${name}.` })
  if (edgeWeb < min)
    issues.push({ rule: 'edge-web', message: `Web between hole and edge is ${edgeWeb.toFixed(2)} mm, below the ${min} mm minimum for ${name}.` })
  return issues
}

// Signed distance from (px, py) to a rounded rect at the origin; negative inside.
function sdRoundRect(px: number, py: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  const qx = Math.abs(px - w / 2) - (w / 2 - r)
  const qy = Math.abs(py - h / 2) - (h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

const TOL = 0.005 // max chord deviation when flattening arcs, mm

export function roundedRect(x: number, y: number, w: number, h: number, r: number): [number, number][] {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  const pts: [number, number][] = []
  const step = r > TOL ? 2 * Math.acos(1 - TOL / r) : Math.PI / 2
  const n = Math.ceil(Math.PI / 2 / step)
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ]
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2)
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  return pts
}

export function bbox(paths: Path[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const { shape: s } of paths) {
    const pts: [number, number][] =
      s.kind === 'circle' ? [[s.cx - s.r, s.cy - s.r], [s.cx + s.r, s.cy + s.r]] : s.pts
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y)
      x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
