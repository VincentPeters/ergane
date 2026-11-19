// Geometry core. Plain TypeScript, no React: the UI, exporters and a future CLI share it.
// Units are mm. Coordinates follow SVG: x right, y down, origin at the nominal outline's top-left.

export type Op = 'engrave' | 'inner' | 'outer'
export type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'poly'; pts: [number, number][] } // closed, arcs flattened
export type Path = { op: Op; shape: Shape }

export type Profile = { id: string; pitch: number; hole: number; width: number }
export const PROFILES: Profile[] = [{ id: 'GRID8-M3', pitch: 8, hole: 3.2, width: 8 }]

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
  | { type: 'strip'; holes: number; rows: number }
  | { type: 'plate'; cols: number; rows: number; pattern: Pattern; radius: number }

export type Ctx = { profile: Profile; material: Material; fit: Fit }

type Layout = { w: number; h: number; r: number; holes: [number, number][]; minGap: number }

// Nominal part before any fit or kerf correction.
function layout(part: Part, p: Profile): Layout {
  const m = p.width / 2 // edge margin: half a pitch on GRID8-M3
  const cols = part.type === 'strip' ? part.holes : part.cols
  const rows = part.rows
  const keep = (i: number, j: number) =>
    part.type === 'strip' || part.pattern === 'full' ? true
    : part.pattern === 'border' ? i === 0 || j === 0 || i === cols - 1 || j === rows - 1
    : (i + j) % 2 === 0
  const holes: [number, number][] = []
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) if (keep(i, j)) holes.push([m + i * p.pitch, m + j * p.pitch])
  const checker = part.type === 'plate' && part.pattern === 'checker'
  return {
    w: (cols - 1) * p.pitch + 2 * m,
    h: (rows - 1) * p.pitch + 2 * m,
    r: part.type === 'strip' ? m : part.radius,
    holes,
    minGap: checker ? p.pitch * Math.SQRT2 : p.pitch,
  }
}

// Correction order: nominal diameter -> fit class offset -> kerf.
// Holes shrink by half the kerf, outer contours grow by half the kerf.
export function holeRadius(nominal: number, fit: Fit, kerf: number) {
  return (nominal + FIT_OFFSET[fit]) / 2 - kerf / 2
}

export function generate(part: Part, ctx: Ctx): Path[] {
  const L = layout(part, ctx.profile)
  const k = ctx.material.kerf / 2
  const r = holeRadius(ctx.profile.hole, ctx.fit, ctx.material.kerf)
  return [
    ...L.holes.map(([cx, cy]): Path => ({ op: 'inner', shape: { kind: 'circle', cx, cy, r } })),
    { op: 'outer', shape: { kind: 'poly', pts: roundedRect(-k, -k, L.w + 2 * k, L.h + 2 * k, L.r + k) } },
  ]
}

export type Issue = { rule: 'hole-web' | 'edge-web'; message: string }

// Webs are measured on the hole as cut (nominal + fit); kerf correction cancels out after cutting.
export function validate(part: Part, ctx: Ctx): Issue[] {
  const L = layout(part, ctx.profile)
  const d = ctx.profile.hole + FIT_OFFSET[ctx.fit]
  const min = ctx.material.minWeb
  const issues: Issue[] = []
  const holeWeb = L.minGap - d
  if (L.holes.length > 1 && holeWeb < min)
    issues.push({ rule: 'hole-web', message: `Web between holes is ${holeWeb.toFixed(2)} mm, below the ${min} mm minimum for ${ctx.material.name}.` })
  const edgeWeb = ctx.profile.width / 2 - d / 2
  if (edgeWeb < min)
    issues.push({ rule: 'edge-web', message: `Web between hole and edge is ${edgeWeb.toFixed(2)} mm, below the ${min} mm minimum for ${ctx.material.name}.` })
  return issues
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
