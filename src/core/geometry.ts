// Geometry core. Plain TypeScript, no React: the UI, exporters and a future CLI share it.
// Units are mm. Coordinates follow SVG: x right, y down, origin at the nominal outline's top-left.
import { text, textWidth } from './font'
import { COMPONENTS, componentHoles, sanitizeComponent, type ComponentDef } from './components'
import { AXLE_D, GT2, axleCross, gearOutline, gearRadii, pulleyOutline, pulleyRadius, rackOutline } from './motion'
import { circle, closestSegSeg, difference, inside, rect, roundedBox, roundedConvex, sector, stadium, union, type Pt } from './shapes'

export type Op = 'engrave' | 'inner' | 'outer'
export type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'poly'; pts: Pt[] } // closed, arcs flattened
  | { kind: 'line'; pts: Pt[] } // open, engrave strokes
export type Path = { op: Op; shape: Shape }

// Nominal hole sizes and the strip width each needs. See spec 3.2 for the 12 mm Technic width.
export type HoleType = 'm3' | 'technic' | 'meccano' | 'custom'
export type HoleSpec = { name: string; short: string; d: number; width: number }
export const HOLES: Record<HoleType, HoleSpec> = {
  m3: { name: 'M3', short: 'M3', d: 3.2, width: 8 },
  technic: { name: 'Technic', short: 'TEC', d: 4.8, width: 12 },
  meccano: { name: 'Meccano', short: 'MEC', d: 4.1, width: 12.7 },
  custom: { name: 'Custom', short: 'CUS', d: 3.2, width: 9 }, // defaults; a CUSTOM profile brings its own
}

// Mixable profiles share the 8 mm grid, so any hole position takes either hole type.
// CUSTOM (spec 3) is free input: its pitch, hole and strip width travel in the profile and the kit file.
export type Profile = { id: string; pitch: number; hole: HoleType; mixable: boolean; custom?: { d: number; width: number } }
export const PROFILES: Profile[] = [
  { id: 'GRID8-M3', pitch: 8, hole: 'm3', mixable: true },
  { id: 'GRID8-TECHNIC', pitch: 8, hole: 'technic', mixable: true },
  { id: 'MECCANO', pitch: 12.7, hole: 'meccano', mixable: false },
  { id: 'CUSTOM', pitch: 10, hole: 'custom', mixable: false, custom: { d: 3.2, width: 9 } },
]

/** The hole size and strip width for a hole type under this profile. */
export const holeSpec = (profile: Profile, t: HoleType): HoleSpec =>
  t === 'custom' && profile.custom ? { ...HOLES.custom, ...profile.custom } : HOLES[t]

const between = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}
/** A profile from a file, link or form: built-ins by id, CUSTOM with clamped values (strip at least 1 mm wider than the hole). */
export function sanitizeProfile(raw: unknown): Profile {
  const r = (raw && typeof raw === 'object' ? raw : { id: raw }) as Record<string, unknown>
  const c = (r.custom ?? r) as Record<string, unknown>
  const base = PROFILES.find((p) => p.id === r.id) ?? PROFILES[0]
  if (base.id !== 'CUSTOM') return base
  const d = between(c.d ?? c.hole, 1, 20, 3.2)
  return { ...base, pitch: between(r.pitch, 4, 50, 10), custom: { d, width: between(c.width, d + 1, 60, Math.max(9, d + 1)) } }
}

export type HoleMix = 'all-m3' | 'all-technic' | 'alternating' | 'border-technic'
export const defaultMix = (p: Profile): HoleMix => (p.hole === 'technic' ? 'all-technic' : 'all-m3')

export type Material = { id: string; name: string; thickness: number; kerf: number; minWeb: number }
export const MATERIALS: Material[] = [
  { id: 'acrylic3', name: 'Acrylic 3 mm', thickness: 3.0, kerf: 0.2, minWeb: 2.0 },
  { id: 'plywood3', name: 'Plywood 3 mm', thickness: 3.0, kerf: 0.15, minWeb: 2.5 },
  { id: 'mdf4', name: 'MDF 4 mm', thickness: 4.0, kerf: 0.2, minWeb: 2.5 },
  { id: 'cardboard', name: 'Cardboard', thickness: 3.8, kerf: 0.3, minWeb: 5.0 },
]

/** A material from a file, link or form: built-ins by id, user presets (spec 4) with clamped values. */
export function sanitizeMaterial(raw: unknown): Material {
  const r = (raw && typeof raw === 'object' ? raw : { id: raw }) as Record<string, unknown>
  const known = MATERIALS.find((m) => m.id === r.id)
  if (r.thickness === undefined) return known ?? MATERIALS[0] // an id alone only names a built-in
  if (typeof r.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(r.id)) return known ?? MATERIALS[0]
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : known?.name ?? r.id
  return {
    id: r.id, name,
    thickness: between(r.thickness, 0.5, 25, known?.thickness ?? 3),
    kerf: between(r.kerf, 0, 1, known?.kerf ?? 0.2),
    minWeb: between(r.minWeb, 0.5, 20, known?.minWeb ?? 2),
  }
}

export type Fit = 'loose' | 'normal' | 'tight'
export const FIT_OFFSET: Record<Fit, number> = { loose: 0.2, normal: 0, tight: -0.1 }

export type Pattern = 'full' | 'border' | 'checker'
export type ConnectorShape = 'T' | 'X' | 'H' | 'Y'
export const ANGLES = [45, 60, 90, 120, 135] as const

export type Part =
  | { type: 'strip'; holes: number; rows: number; label?: boolean }
  | { type: 'slotted'; holes: number; slot: number; label?: boolean }
  | { type: 'plate'; cols: number; rows: number; pattern: Pattern; radius: number; label?: boolean }
  | { type: 'angle'; armA: number; armB: number; angle: number; label?: boolean }
  | { type: 'gusset'; holes: number; label?: boolean }
  | { type: 'frame'; cols: number; rows: number; border: number; label?: boolean }
  | { type: 'connector'; shape: ConnectorShape; arm: number; label?: boolean }
  | { type: 'disc'; diameter: number; count: number; label?: boolean }
  | { type: 'curved'; radius: number; angle: number; label?: boolean }
  | { type: 'spacer'; outer: number; quantity: number; label?: boolean }
  | { type: 'bracket'; cols: number; base: number; height: number; label?: boolean }
  | { type: 'box'; cols: number; rows: number; height: number; lid: Lid; label?: boolean }
  | { type: 'nutjoint'; cols: number; rows: number; bolt: number; label?: boolean }
  | { type: 'mount'; component: ComponentDef; border: number; label?: boolean }
  | { type: 'adapter'; cols8: number; cols127: number; rows: number; label?: boolean }
  | { type: 'gear'; teeth: number; module: number; bore: Bore; label?: boolean }
  | { type: 'rack'; holes: number; module: number; label?: boolean }
  | { type: 'wheel'; diameter: number; groove: number; bore: Bore; label?: boolean }
  | { type: 'pulley'; teeth: number; bore: Bore; label?: boolean }
  | { type: 'coupon' }
/** The centre of a turning part: a round hole for a bolt, or a Technic axle cross. */
export type Bore = 'hole' | 'axle'
export type Lid = 'closed' | 'open'
export type GridPart = Exclude<Part, { type: 'coupon' }>

export type Ctx = {
  profile: Profile; material: Material; fit: Fit; holeMix?: HoleMix
  sheet?: { w: number; h: number; spacing: number }
  pressFit?: number // calibrated with the coupon's slots; PRESS_FIT until then
}

// Part parameters arrive from forms, files and URLs; clamp them here so no caller can build a broken part.
const int = (v: unknown, lo: number, hi: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo
}
const num = (v: unknown, lo: number, hi: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo
}
const bore = (v: unknown): Bore => (v === 'axle' ? 'axle' : 'hole')
export function clampPart(part: Part): Part {
  switch (part.type) {
    case 'strip': return { ...part, holes: int(part.holes, 2, 50), rows: int(part.rows, 1, 3) }
    case 'slotted': {
      const holes = int(part.holes, 4, 50)
      return { ...part, holes, slot: int(part.slot, 1, holes - 3) }
    }
    case 'plate': return {
      ...part, cols: int(part.cols, 2, 50), rows: int(part.rows, 2, 50), radius: num(part.radius, 0, 50),
      pattern: (['full', 'border', 'checker'] as const).includes(part.pattern) ? part.pattern : 'full',
    }
    case 'angle': {
      const angle = Number(part.angle)
      return { ...part, armA: int(part.armA, 2, 25), armB: int(part.armB, 2, 25), angle: (ANGLES as readonly number[]).includes(angle) ? angle : 90 }
    }
    case 'gusset': return { ...part, holes: int(part.holes, 2, 25) }
    case 'frame': {
      const border = int(part.border, 1, 5)
      return { ...part, border, cols: int(part.cols, 2 * border + 1, 50), rows: int(part.rows, 2 * border + 1, 50) }
    }
    case 'connector': return { ...part, shape: (['T', 'X', 'H', 'Y'] as const).includes(part.shape) ? part.shape : 'X', arm: int(part.arm, 1, 12) }
    case 'disc': return { ...part, diameter: int(part.diameter, 3, 40), count: int(part.count, 3, 24) }
    case 'curved': return { ...part, radius: int(part.radius, 2, 60), angle: int(part.angle, 10, 270) }
    case 'spacer': return { ...part, outer: num(part.outer, 5, 30), quantity: int(part.quantity, 1, 48) }
    case 'bracket': return { ...part, cols: int(part.cols, 2, 30), base: int(part.base, 1, 30), height: int(part.height, 1, 30) }
    case 'box': return {
      ...part, cols: int(part.cols, 2, 30), rows: int(part.rows, 2, 30), height: int(part.height, 1, 30),
      lid: part.lid === 'open' ? 'open' : 'closed',
    }
    case 'nutjoint': {
      const cols = int(part.cols, 5, 31)
      return { ...part, cols: cols % 2 ? cols : cols + 1, rows: int(part.rows, 1, 20), bolt: int(part.bolt, 10, 30) }
    }
    case 'mount': {
      // The component may come from a shared kit or URL: re-check it, fall back to the first built-in.
      const c = sanitizeComponent(part.component)
      return { ...part, component: typeof c === 'string' ? COMPONENTS[0] : c, border: int(part.border, 1, 3) }
    }
    case 'adapter': return { ...part, cols8: int(part.cols8, 2, 25), cols127: int(part.cols127, 2, 16), rows: int(part.rows, 2, 25) }
    case 'gear': return { ...part, teeth: int(part.teeth, 8, 120), module: num(part.module, 0.8, 5), bore: bore(part.bore) }
    case 'rack': return { ...part, holes: int(part.holes, 3, 50), module: num(part.module, 0.8, 5) }
    case 'wheel': return { ...part, diameter: num(part.diameter, 24, 300), groove: num(part.groove, 1, 8), bore: bore(part.bore) }
    case 'pulley': return { ...part, teeth: int(part.teeth, 12, 80), bore: bore(part.bore) }
    case 'coupon': return part
  }
}

// Spec 7: tab slots are the material thickness minus a press fit.
export const PRESS_FIT = 0.1
// Nut across flats and thickness per bolt size; clearance added to each when cutting the pocket.
const NUTS = { m3: { af: 5.5, t: 2.4 }, meccano: { af: 7.0, t: 3.2 } }
const NUT_CLEAR = 0.2
// Minimum gap between a component's footprint and the border holes of its mounting plate, mm.
const MOUNT_CLEAR = 3

/** How a panel edge meets its neighbour: plain, fingers at both ends, or notches at both ends. */
type EdgeKind = 'flat' | 'tabs' | 'slots'
const GAP = 3 // mm between pieces of a multi-piece part
const OUT = 1 // mm a notch extends past the edge, so the cut never shares a line with the outline

/** A hole (a equals b) or a slot (a to b), cut at the hole type's diameter unless d gives its own. */
type Feature = { a: Pt; b: Pt; type: HoleType; d?: number; axle?: boolean } // axle: cut as a Technic cross
/** Outlines and features of a part. Outer rings grow by g, inner cutouts shrink by g. */
type Geo = { outer: Pt[][]; inner: Pt[][]; features: Feature[]; corner: number; label: string; engrave?: Pt[][] }

function build(part: GridPart, ctx: Ctx, g: number): Geo {
  const p = ctx.profile.pitch
  const mix = ctx.profile.mixable ? (ctx.holeMix ?? defaultMix(ctx.profile)) : null
  const typeAt = (k: number, border: boolean): HoleType => {
    if (!mix) return ctx.profile.hole
    if (mix === 'alternating') return k % 2 ? 'm3' : 'technic'
    if (mix === 'border-technic') return border ? 'technic' : 'm3'
    return mix === 'all-technic' ? 'technic' : 'm3'
  }
  const hole = (x: number, y: number, k: number, border = true): Feature => ({ a: [x, y], b: [x, y], type: typeAt(k, border) })
  // The widest hole type in use sets the strip width; the edge margin is half of it.
  const half = (fs: Feature[]) => Math.max(...fs.map((f) => holeSpec(ctx.profile, f.type).width)) / 2
  // Positions that do not sit on the grid (rings, arcs) are placed for the widest type the mix can use.
  const mixTypes: HoleType[] = !mix ? [ctx.profile.hole] : mix === 'all-m3' ? ['m3'] : mix === 'all-technic' ? ['technic'] : ['m3', 'technic']
  const mMax = Math.max(...mixTypes.map((t) => holeSpec(ctx.profile, t).width)) / 2
  const grid = (cols: number, rows: number, keep: (i: number, j: number) => boolean) => {
    const fs: Feature[] = []
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++)
        if (keep(i, j)) fs.push(hole(i * p, j * p, i + j, i === 0 || j === 0 || i === cols - 1 || j === rows - 1))
    return fs
  }

  // A flat face with a hole grid and finger-jointed edges, top-left corner at `at`.
  // Edges are [top, right, bottom, left]. A jointed edge adds the material thickness to its margin,
  // so holes keep a full edge margin from the bottom of the finger notches.
  const t = ctx.material.thickness
  const panel = (cols: number, rows: number, edges: [EdgeKind, EdgeKind, EdgeKind, EdgeKind], at: Pt) => {
    const [eT, eR, eB, eL] = edges
    const inset = (e: EdgeKind) => (e === 'flat' ? mMax : mMax + t)
    const [ox, oy] = at
    const w = (cols - 1) * p + inset(eL) + inset(eR), h = (rows - 1) * p + inset(eT) + inset(eB)
    const features: Feature[] = []
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++)
        features.push(hole(ox + inset(eL) + i * p, oy + inset(eT) + j * p, i + j, i === 0 || j === 0 || i === cols - 1 || j === rows - 1))
    // Notches along an edge of length L, as [start, end] along it. Cutting grows the outline by g:
    // fingers widen by g on each side, notches narrow by g and get g shallower.
    const notches = (L: number, kind: EdgeKind): [number, number][] => {
      if (kind === 'flat') return []
      let n = Math.floor(L / p)
      if (n % 2 === 0) n -= 1
      n = Math.max(3, n)
      const fw = L / n
      return Array.from({ length: n }, (_, k) => k)
        .filter((k) => (kind === 'tabs' ? k % 2 === 1 : k % 2 === 0))
        .map((k) => [k === 0 ? -OUT : k * fw + g, k === n - 1 ? L + OUT : (k + 1) * fw - g])
    }
    const cuts: Pt[][] = [
      ...notches(w, eT).map(([a, b]) => rect(ox + a, oy - g - OUT, ox + b, oy + t - g)),
      ...notches(w, eB).map(([a, b]) => rect(ox + a, oy + h - t + g, ox + b, oy + h + g + OUT)),
      ...notches(h, eL).map(([a, b]) => rect(ox - g - OUT, oy + a, ox + t - g, oy + b)),
      ...notches(h, eR).map(([a, b]) => rect(ox + w - t + g, oy + a, ox + w + g + OUT, oy + b)),
    ]
    const outer = difference(rect(ox - g, oy - g, ox + w + g, oy + h + g), cuts)[0]
    return { outer, features, w, h }
  }

  // Centre bore of a turning part, plus four grid holes one pitch out when the part is big enough,
  // so it bolts straight onto a strip. `solid` is the radius of solid material around the centre.
  const turning = (b: Bore, solid: number, cx = 0): Feature[] => {
    const fs: Feature[] = [b === 'axle' ? { a: [cx, 0], b: [cx, 0], type: 'm3', d: AXLE_D, axle: true } : hole(cx, 0, 0, false)]
    if (solid - p >= mMax) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) fs.push(hole(cx + dx * p, dy * p, 1, true))
    return fs
  }
  // Discs in a row, each [outer radius, solid radius], with a bore (and grid holes where they fit) in each.
  const stack = (discs: [number, number][], b: Bore, lbl: string, shape?: (i: number, x: number) => Pt[] | undefined): Geo => {
    const out: Geo = { features: [], outer: [], inner: [], corner: 0, label: lbl }
    let x = 0
    discs.forEach(([R, solid], i) => {
      const cx = x + R
      out.features.push(...turning(b, solid, cx))
      out.outer.push(shape?.(i, cx) ?? circle([cx, 0], R + g))
      out.corner = Math.max(out.corner, R)
      x += 2 * R + GAP
    })
    return out
  }

  switch (part.type) {
    case 'strip': {
      const fs = grid(part.holes, part.rows, () => true)
      const m = half(fs)
      return { features: fs, outer: [roundedBox(0, 0, (part.holes - 1) * p, (part.rows - 1) * p, m + g)], inner: [], corner: m, label: `${part.holes}` }
    }
    case 'slotted': {
      // One slot centred on the strip, a hole at every grid position outside it.
      const n = part.holes, s = part.slot, a = Math.floor((n - 1 - s) / 2)
      const fs = grid(n, 1, (i) => i < a || i > a + s)
      fs.push({ a: [a * p, 0], b: [(a + s) * p, 0], type: typeAt(a, true) })
      const m = half(fs)
      return { features: fs, outer: [stadium([0, 0], [(n - 1) * p, 0], m + g)], inner: [], corner: m, label: `S${n}` }
    }
    case 'plate': {
      const { cols, rows, pattern } = part
      const fs = grid(cols, rows, (i, j) =>
        pattern === 'full' ? true : pattern === 'border' ? i === 0 || j === 0 || i === cols - 1 || j === rows - 1 : (i + j) % 2 === 0)
      const m = half(fs), W = (cols - 1) * p, H = (rows - 1) * p
      const R = Math.min(part.radius, (Math.min(W, H) + 2 * m) / 2)
      return {
        features: fs, inner: [], corner: R, label: `${cols}x${rows}`,
        outer: [roundedBox(-m + R, -m + R, W + m - R, H + m - R, R + g)],
      }
    }
    case 'angle': {
      // Arm A runs right from the pivot hole, arm B rises at the chosen angle; both share the pivot.
      const t = (part.angle * Math.PI) / 180
      const dir: Pt = [Math.cos(t), -Math.sin(t)]
      const fs = [hole(0, 0, 0)]
      for (let i = 1; i < part.armA; i++) fs.push(hole(i * p, 0, i))
      for (let j = 1; j < part.armB; j++) fs.push(hole(j * p * dir[0], j * p * dir[1], j))
      const m = half(fs)
      const endB: Pt = [(part.armB - 1) * p * dir[0], (part.armB - 1) * p * dir[1]]
      const u = union([stadium([0, 0], [(part.armA - 1) * p, 0], m + g), stadium([0, 0], endB, m + g)])
      return { features: fs, outer: u.outer, inner: u.holes, corner: m, label: `${part.angle}` }
    }
    case 'gusset': {
      // Right-angled corner brace: holes along both legs, the long side stays solid.
      const n = part.holes
      const fs = [...grid(n, 1, () => true), ...grid(1, n, (_, j) => j > 0)]
      const m = half(fs)
      return { features: fs, outer: [roundedConvex([[0, 0], [(n - 1) * p, 0], [0, (n - 1) * p]], m + g)], inner: [], corner: m, label: `G${n}` }
    }
    case 'frame': {
      const { cols, rows, border: b } = part
      const fs = grid(cols, rows, (i, j) => i < b || j < b || i >= cols - b || j >= rows - b)
      const m = half(fs), W = (cols - 1) * p, H = (rows - 1) * p
      // The window keeps one edge margin clear of the innermost holes; the cut shrinks it by g.
      const wr = 2
      const x0 = (b - 1) * p + m, y0 = x0, x1 = (cols - b) * p - m, y1 = (rows - b) * p - m
      return {
        features: fs, corner: m, label: `F${cols}x${rows}`,
        outer: [roundedBox(0, 0, W, H, m + g)],
        inner: [roundedBox(x0 + wr, y0 + wr, x1 - wr, y1 - wr, Math.max(0, wr - g))],
      }
    }
    case 'connector': {
      const a = part.arm
      const y30: Pt = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]
      const segs: [Pt, Pt][] = {
        X: [[[-a, 0], [a, 0]], [[0, -a], [0, a]]] as [Pt, Pt][],
        T: [[[-a, 0], [a, 0]], [[0, 0], [0, a]]] as [Pt, Pt][],
        H: [[[0, -a], [0, a]], [[a + 1, -a], [a + 1, a]], [[0, 0], [a + 1, 0]]] as [Pt, Pt][],
        Y: [[[0, 0], [0, -a]], [[0, 0], [-y30[0] * a, y30[1] * a]], [[0, 0], [y30[0] * a, y30[1] * a]]] as [Pt, Pt][],
      }[part.shape]
      // One hole per pitch along every arm; shared crossings appear once.
      const seen = new Map<string, Feature>()
      for (const [s, e] of segs) {
        const steps = Math.round(Math.hypot(e[0] - s[0], e[1] - s[1]))
        for (let k = 0; k <= steps; k++) {
          const x = (s[0] + ((e[0] - s[0]) * k) / steps) * p, y = (s[1] + ((e[1] - s[1]) * k) / steps) * p
          const key = `${Math.round(x * 1e3)},${Math.round(y * 1e3)}`
          if (!seen.has(key)) seen.set(key, hole(x, y, Math.round(Math.abs(x) / p + Math.abs(y) / p)))
        }
      }
      const fs = [...seen.values()]
      const m = half(fs)
      const u = union(segs.map(([s, e]) => stadium([s[0] * p, s[1] * p], [e[0] * p, e[1] * p], m + g)))
      return { features: fs, outer: u.outer, inner: u.holes, corner: m, label: `${part.shape}${a}` }
    }
    case 'disc': {
      // Centre hole plus a ring of holes one edge margin inside the rim.
      const R = (part.diameter * p) / 2, Rh = R - mMax
      const fs = [hole(0, 0, 0, false)]
      for (let k = 0; k < part.count; k++) {
        const t = (2 * Math.PI * k) / part.count - Math.PI / 2
        fs.push(hole(Rh * Math.cos(t), Rh * Math.sin(t), k + 1, true))
      }
      return { features: fs, outer: [circle([0, 0], R + g)], inner: [], corner: R, label: `D${part.diameter}` }
    }
    case 'spacer': {
      // Rings set out on a square grid with a 3 mm gap, one hole each.
      const per = Math.ceil(Math.sqrt(part.quantity)), step = part.outer + 3, R = part.outer / 2
      const fs: Feature[] = [], outer: Pt[][] = []
      for (let k = 0; k < part.quantity; k++) {
        const c: Pt = [(k % per) * step, Math.floor(k / per) * step]
        fs.push(hole(c[0], c[1], k))
        outer.push(circle(c, R + g))
      }
      return { features: fs, outer, inner: [], corner: R, label: '' }
    }
    case 'bracket': {
      // Base and upright meet along one finger joint; the upright owns the joint's end fingers.
      const base = panel(part.cols, part.base, ['slots', 'flat', 'flat', 'flat'], [0, 0])
      const up = panel(part.cols, part.height, ['flat', 'flat', 'tabs', 'flat'], [base.w + GAP, 0])
      return { features: [...base.features, ...up.features], outer: [base.outer, up.outer], inner: [], corner: 0, label: `B${part.cols}` }
    }
    case 'box': {
      // Six (or five) faces with finger joints on every shared edge. Front and back own the corner cubes:
      // their edges keep fingers at both ends; sides keep end fingers only toward bottom and lid;
      // bottom and lid keep none. That way each corner cube belongs to exactly one panel.
      const { cols, rows, height } = part
      const lid: EdgeKind = part.lid === 'closed' ? 'tabs' : 'flat'
      const faces: [number, number, [EdgeKind, EdgeKind, EdgeKind, EdgeKind], string][] = [
        [cols, rows, ['slots', 'slots', 'slots', 'slots'], 'bottom'],
        ...(part.lid === 'closed' ? [[cols, rows, ['slots', 'slots', 'slots', 'slots'], 'lid'] as typeof faces[number]] : []),
        [cols, height, [lid, 'tabs', 'tabs', 'tabs'], 'front'],
        [cols, height, [lid, 'tabs', 'tabs', 'tabs'], 'back'],
        [rows, height, [lid, 'slots', 'tabs', 'slots'], 'left'],
        [rows, height, [lid, 'slots', 'tabs', 'slots'], 'right'],
      ]
      // Shelf layout: two faces per row, 3 mm apart, placed from the nominal sizes so cut and nominal align.
      const out: Geo = { features: [], outer: [], inner: [], corner: 0, label: `${cols}x${rows}x${height}` }
      let x = 0, y = 0, rowH = 0
      faces.forEach(([c, r, edges], i) => {
        const pn = panel(c, r, edges, [x, y])
        out.features.push(...pn.features)
        out.outer.push(pn.outer)
        rowH = Math.max(rowH, pn.h)
        if (i % 2 === 1) { x = 0; y += rowH + GAP; rowH = 0 } else x += pn.w + GAP
      })
      return out
    }
    case 'nutjoint': {
      // Plate A stands on plate B. A's bottom edge carries two alignment tabs and a T-slot that traps a nut;
      // B carries the matching press-fit tab slots and the bolt hole. Bolt length sets how deep the T-slot runs.
      const bolt = ctx.profile.hole === 'meccano' ? 'meccano' : 'm3'
      const nut = NUTS[bolt]
      const d = holeSpec(ctx.profile, bolt).d + FIT_OFFSET[ctx.fit]
      const m = mMax, cols = part.cols, W = (cols - 1) * p + 2 * m, cx = W / 2
      const slotLen = part.bolt - t + 1 // into A, with 1 mm spare past the bolt tip
      const pocketTop = part.bolt - t - 0.7 // far face of the nut pocket, 0.7 mm short of the bolt tip
      const pocketH = nut.t + NUT_CLEAR, pocketW = nut.af + NUT_CLEAR
      const Hb = (part.rows - 1) * p + 2 * m + slotLen // holes stay a full margin above the slot end
      const tw = 6, tabs = [cx - 2 * p, cx + 2 * p]
      const fsA: Feature[] = []
      for (let j = 0; j < part.rows; j++)
        for (let i = 0; i < cols; i++) fsA.push(hole(m + i * p, m + j * p, i + j, i === 0 || j === 0 || i === cols - 1 || j === part.rows - 1))
      const bodyA = union([rect(-g, -g, W + g, Hb + g), ...tabs.map((x) => rect(x - tw / 2 - g, Hb - OUT, x + tw / 2 + g, Hb + t + g))]).outer[0]
      const outerA = difference(bodyA, [
        rect(cx - d / 2 + g, Hb - slotLen + g, cx + d / 2 - g, Hb + t + OUT), // bolt slot, open at the edge
        rect(cx - pocketW / 2 + g, Hb - pocketTop + g, cx + pocketW / 2 - g, Hb - pocketTop + pocketH - g), // nut pocket
      ])[0]
      // Plate B: three rows; the middle row holds the bolt hole and the two tab slots instead of grid holes.
      const yB = Hb + t + GAP, yc = yB + m + p
      const fsB: Feature[] = []
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < cols; i++) {
          const x = m + i * p
          if (j === 1 && tabs.some((tx) => Math.abs(x - tx) < p - 0.01)) continue
          fsB.push(j === 1 && Math.abs(x - cx) < 0.01 ? { a: [x, yc], b: [x, yc], type: bolt } : hole(x, yB + m + j * p, i + j, true))
        }
      const sw = tw + NUT_CLEAR, sh = t - (ctx.pressFit ?? PRESS_FIT)
      const slotsB = tabs.map((x) => rect(x - sw / 2 + g, yc - sh / 2 + g, x + sw / 2 - g, yc + sh / 2 - g))
      return {
        features: [...fsA, ...fsB], outer: [outerA, rect(-g, yB - g, W + g, yB + 2 * p + 2 * m + g)], inner: slotsB,
        corner: 0, label: `N${part.bolt}`,
      }
    }
    case 'mount': {
      // Grid holes on the border, the component pattern centred inside with at least MOUNT_CLEAR mm
      // between its footprint and the border holes. The plate grows in whole pitches to fit.
      const c = part.component, b = part.border
      const holes = componentHoles(c)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      const grow = (x: number, y: number, rx: number, ry: number) => {
        x0 = Math.min(x0, x - rx); x1 = Math.max(x1, x + rx); y0 = Math.min(y0, y - ry); y1 = Math.max(y1, y + ry)
      }
      for (const h of holes) grow(h.x, h.y, h.d / 2, h.d / 2)
      for (const k of c.cutouts ?? []) k.shape === 'circle' ? grow(k.x, k.y, k.d / 2, k.d / 2) : grow(k.x, k.y, k.w / 2, k.h / 2)
      if (c.outline) grow(c.outline.x ?? 0, c.outline.y ?? 0, c.outline.w / 2, c.outline.h / 2)
      const rb = Math.max(...mixTypes.map((t) => holeSpec(ctx.profile, t).d)) / 2
      const span = (len: number) => Math.max(2 * b, 2 * b - 1 + Math.ceil((len + 2 * MOUNT_CLEAR + 2 * rb) / p))
      const cols = span(x1 - x0), rows = span(y1 - y0)
      const fs = grid(cols, rows, (i, j) => i < b || j < b || i >= cols - b || j >= rows - b)
      const ox = ((cols - 1) * p) / 2 - (x0 + x1) / 2, oy = ((rows - 1) * p) / 2 - (y0 + y1) / 2
      for (const h of holes) fs.push({ a: [ox + h.x, oy + h.y], b: [ox + h.x, oy + h.y], type: 'm3', d: h.d })
      const inner: Pt[][] = []
      for (const k of c.cutouts ?? []) {
        if (k.shape === 'circle') fs.push({ a: [ox + k.x, oy + k.y], b: [ox + k.x, oy + k.y], type: 'm3', d: k.d })
        else inner.push(rect(ox + k.x - k.w / 2 + g, oy + k.y - k.h / 2 + g, ox + k.x + k.w / 2 - g, oy + k.y + k.h / 2 - g))
      }
      // The component's footprint is engraved so it is easy to place the right way round.
      const engrave: Pt[][] = []
      if (c.outline) {
        const cx = ox + (c.outline.x ?? 0), cy = oy + (c.outline.y ?? 0), w = c.outline.w / 2, h = c.outline.h / 2
        engrave.push([[cx - w, cy - h], [cx + w, cy - h], [cx + w, cy + h], [cx - w, cy + h], [cx - w, cy - h]])
      }
      const m = half(fs.filter((f) => f.d === undefined))
      return {
        features: fs, inner, engrave, corner: m, label: c.short ?? '',
        outer: [roundedBox(0, 0, (cols - 1) * p, (rows - 1) * p, m + g)],
      }
    }
    case 'adapter': {
      // 8 mm grid on the left, half-inch Meccano grid on the right, one Meccano pitch between them.
      const P2 = 12.7
      const left: HoleType[] = ctx.profile.mixable ? [] : ['m3'] // a Meccano profile still gets M3 on the 8 mm side
      const H8 = (part.rows - 1) * 8
      const rows127 = Math.floor(H8 / P2 + 1e-9) + 1, H127 = (rows127 - 1) * P2
      const H = Math.max(H8, H127)
      const fs: Feature[] = []
      for (let j = 0; j < part.rows; j++)
        for (let i = 0; i < part.cols8; i++)
          fs.push(left.length ? { a: [i * 8, (H - H8) / 2 + j * 8], b: [i * 8, (H - H8) / 2 + j * 8], type: 'm3' } : hole(i * 8, (H - H8) / 2 + j * 8, i + j))
      const xr = (part.cols8 - 1) * 8 + P2
      for (let j = 0; j < rows127; j++)
        for (let i = 0; i < part.cols127; i++) {
          const x = xr + i * P2, y = (H - H127) / 2 + j * P2
          fs.push({ a: [x, y], b: [x, y], type: 'meccano' })
        }
      const m = half(fs)
      return { features: fs, inner: [], corner: m, label: 'A8', outer: [roundedBox(0, 0, xr + (part.cols127 - 1) * P2, H, m + g)] }
    }
    case 'gear': {
      const { rf, ra } = gearRadii(part.teeth, part.module)
      return { features: turning(part.bore, rf), outer: [gearOutline(part.teeth, part.module, g)], inner: [], corner: ra, label: `Z${part.teeth}` }
    }
    case 'rack': {
      // A strip with teeth along its top edge; same module as a gear means they mesh.
      const n = part.holes, fs = grid(n, 1, () => true), m = half(fs)
      return {
        features: fs, inner: [], corner: 0, label: `M${+part.module.toFixed(1)}`,
        outer: [rackOutline(-m, (n - 1) * p + m, m, -m, part.module, g)],
      }
    }
    case 'wheel': {
      // A sheet cannot hold an edge groove, so the wheel is a stack: flange, core, flange.
      // The flanges stand proud of the core by the groove depth, which seats an O-ring or rubber band.
      const R = part.diameter / 2, Rf = R + part.groove
      return stack([[Rf, Rf], [R, R], [Rf, Rf]], part.bore, `W${Math.round(part.diameter)}`)
    }
    case 'pulley': {
      // GT2 pulley stack: toothed cores as thick as the 6 mm belt, plus a flange either side.
      const R = pulleyRadius(part.teeth), cores = Math.max(1, Math.ceil(GT2.beltWidth / t - 1e-9))
      const pieces: [number, number][] = [[R + 2, R + 2], ...Array.from({ length: cores }, (): [number, number] => [R, R - GT2.depth]), [R + 2, R + 2]]
      return stack(pieces, part.bore, '', (i, x) => (i === 0 || i === pieces.length - 1 ? undefined : pulleyOutline(part.teeth, g).map(([px, py]) => [px + x, py] as Pt)))
    }
    case 'curved': {
      // Holes on the centre arc one pitch apart as a straight line (chord), so they bolt to straight parts.
      const R = part.radius * p
      const step = 2 * Math.asin(Math.min(1, p / (2 * R)))
      const n = Math.max(2, Math.floor((part.angle * Math.PI) / 180 / step + 1e-9) + 1)
      const a0 = -Math.PI / 2 - ((n - 1) * step) / 2
      const fs = Array.from({ length: n }, (_, k) => hole(R * Math.cos(a0 + k * step), R * Math.sin(a0 + k * step), k))
      const m = half(fs)
      return { features: fs, outer: [sector([0, 0], R, m + g, a0, a0 + (n - 1) * step)], inner: [], corner: m, label: `R${part.radius}` }
    }
  }
}

// Builds the nominal part (grow 0) and moves it so its outline starts at (0, 0); `g` builds the cut version.
function placed(part: GridPart, ctx: Ctx, g: number): Geo {
  const nominal = build(part, ctx, 0)
  let ox = Infinity, oy = Infinity
  for (const poly of nominal.outer) for (const [x, y] of poly) { ox = Math.min(ox, x); oy = Math.min(oy, y) }
  const geo = g === 0 ? nominal : build(part, ctx, g)
  const mv = (q: Pt): Pt => [q[0] - ox, q[1] - oy]
  return {
    ...geo,
    outer: geo.outer.map((poly) => poly.map(mv)),
    inner: geo.inner.map((poly) => poly.map(mv)),
    features: geo.features.map((f) => ({ ...f, a: mv(f.a), b: mv(f.b) })),
    engrave: geo.engrave?.map((line) => line.map(mv)),
  }
}

// Correction order: nominal diameter -> fit class offset -> kerf.
// Holes shrink by half the kerf, outer contours grow by half the kerf.
export function holeRadius(nominal: number, fit: Fit, kerf: number) {
  return (nominal + FIT_OFFSET[fit]) / 2 - kerf / 2
}

const engrave = (s: string, cx: number, cy: number, h: number): Path[] =>
  text(s, cx, cy, h).map((pts) => ({ op: 'engrave', shape: { kind: 'line', pts } }))

export function generate(part: Part, ctx: Ctx): Path[] {
  if (part.type === 'coupon') return coupon(ctx)
  const q = clampPart(part) as GridPart
  const kerf = ctx.material.kerf
  const geo = placed(q, ctx, kerf / 2)
  const paths: Path[] = geo.features.map((f): Path => {
    const r = holeRadius(f.d ?? holeSpec(ctx.profile, f.type).d, ctx.fit, kerf)
    if (f.axle) return { op: 'inner', shape: { kind: 'poly', pts: axleCross(f.a[0], f.a[1], FIT_OFFSET[ctx.fit], kerf / 2) } }
    return f.a[0] === f.b[0] && f.a[1] === f.b[1]
      ? { op: 'inner', shape: { kind: 'circle', cx: f.a[0], cy: f.a[1], r } }
      : { op: 'inner', shape: { kind: 'poly', pts: stadium(f.a, f.b, r) } }
  })
  for (const pts of geo.inner) paths.push({ op: 'inner', shape: { kind: 'poly', pts } })
  for (const pts of geo.engrave ?? []) paths.push({ op: 'engrave', shape: { kind: 'line', pts } })
  if (q.label) paths.push(...label(geo, ctx))
  for (const pts of geo.outer) paths.push({ op: 'outer', shape: { kind: 'poly', pts } })
  return paths
}

const LABEL_H = 2.5 // max cap height, mm
const LABEL_CLEAR = 0.8 // gap between text and hole edge, mm, so the label never reads as touching a ring

// Engraved between the first two side-by-side holes one pitch apart, shrunk to fit. Skipped below 1 mm.
function label(geo: Geo, ctx: Ctx): Path[] {
  const p = ctx.profile.pitch
  const holes = geo.features.filter((f) => !f.axle && f.a[0] === f.b[0] && f.a[1] === f.b[1])
  if (!geo.label) return []
  for (const a of holes) {
    const b = holes.find((h) => Math.abs(h.a[1] - a.a[1]) < 1e-6 && Math.abs(h.a[0] - a.a[0] - p) < 1e-6)
    // Both holes must sit on one piece: two spacers one pitch apart have only air between them.
    if (!b || !geo.outer.some((o) => inside([a.a[0] + p / 2, a.a[1]], o))) continue
    const gap = p - (holeSpec(ctx.profile, a.type).d + holeSpec(ctx.profile, b.type).d) / 2 - 2 * LABEL_CLEAR
    const h = Math.min(LABEL_H, (LABEL_H * gap) / textWidth(geo.label, LABEL_H))
    return h < 1 ? [] : engrave(geo.label, a.a[0] + p / 2, a.a[1], h)
  }
  return []
}

// Calibration coupon: 7 holes per hole type, each cut with a candidate kerf 0.05 mm apart.
// The engraved label is that kerf, so the best-fitting hole's label is the value to enter.
export const COUPON_STEP = 0.05
export function couponKerfs(kerf: number) {
  const base = Math.max(kerf, 3 * COUPON_STEP) // keep the smallest candidate at 0 or above
  return [-3, -2, -1, 0, 1, 2, 3].map((n) => +(base + n * COUPON_STEP).toFixed(2))
}

/** Five press-fit candidates for the coupon's tab slots, centred on the current value, never below 0. */
export function couponPressFits(pressFit: number) {
  const base = Math.max(pressFit, 2 * COUPON_STEP)
  return [-2, -1, 0, 1, 2].map((n) => +(base + n * COUPON_STEP).toFixed(2))
}

function coupon(ctx: Ctx): Path[] {
  const types: HoleType[] = ctx.profile.mixable ? ['m3', 'technic'] : [ctx.profile.hole]
  const kerfs = couponKerfs(ctx.material.kerf)
  const gutter = 12, col = 11, row = 16, top = 6 // col leaves ~4 mm between 2.2 mm labels
  const g = ctx.material.kerf / 2
  const paths: Path[] = []
  // Slot row (spec 7): five tab slots, thickness minus each press-fit candidate, cut with the current kerf.
  // Push a strip of the same material into each; the label of the snug one is the press fit.
  const slotY = top + types.length * row, t = ctx.material.thickness
  paths.push(...engrave('FIT', gutter / 2 + 1, slotY, 2.5))
  couponPressFits(ctx.pressFit ?? PRESS_FIT).forEach((pf, c) => {
    const x = gutter + 5 + c * col, hw = 4, hh = (t - pf) / 2
    paths.push({ op: 'inner', shape: { kind: 'poly', pts: rect(x - hw + g, slotY - hh + g, x + hw - g, slotY + hh - g) } })
    paths.push(...engrave(pf.toFixed(2), x, slotY + hh + 3.2, 2.2))
  })
  types.forEach((t, r) => {
    const y = top + r * row
    paths.push(...engrave(holeSpec(ctx.profile, t).short, gutter / 2 + 1, y, 2.5))
    kerfs.forEach((k, c) => {
      const x = gutter + 5 + c * col
      paths.push({ op: 'inner', shape: { kind: 'circle', cx: x, cy: y, r: holeRadius(holeSpec(ctx.profile, t).d, 'normal', k) } })
      paths.push(...engrave(k.toFixed(2), x, y + 5.5, 2.2))
    })
  })
  const w = gutter + 5 + 6 * col + 6, h = slotY + t / 2 + 7, r = 3
  paths.push({ op: 'outer', shape: { kind: 'poly', pts: roundedBox(r, r, w - r, h - r, r + g) } })
  return paths
}

export type Issue = { rule: 'hole-web' | 'edge-web' | 'sheet-fit'; message: string }
export const RULE_COUNT = 3

/** A web as a line across the material, from one cut edge to the other, in nominal part coordinates. */
export type Span = [number, number, number, number]

/** Nominal size and smallest webs of a part as cut. holeWeb is Infinity with a single hole. */
export type Measure = {
  w: number; h: number; holeWeb: number; edgeWeb: number; types: HoleType[]
  holeSpan: Span | null; edgeSpan: Span | null // where the smallest webs are, for drawing failures
  corner: number // outline corner radius, for the selection ring
  own: number[] // nominal diameters of holes that set their own size (component patterns, bores)
  axle: boolean // has a Technic axle cross
}

// Webs are measured on holes as cut (nominal + fit); kerf correction cancels out after cutting.
// On ties the last pair in reading order wins, keeping a drawn fault away from the label near hole 1.
export function measure(part: GridPart, ctx: Ctx): Measure {
  const geo = placed(clampPart(part) as GridPart, ctx, 0)
  const fs = geo.features
    .map((f) => {
      const d = (f.d ?? holeSpec(ctx.profile, f.type).d) + FIT_OFFSET[ctx.fit]
      return { ...f, d, x0: Math.min(f.a[0], f.b[0]) - d / 2, x1: Math.max(f.a[0], f.b[0]) + d / 2, y0: Math.min(f.a[1], f.b[1]) - d / 2, y1: Math.max(f.a[1], f.b[1]) + d / 2 }
    })
    .sort((u, v) => u.x0 - v.x0 || u.y0 - v.y0)

  let holeWeb = Infinity, holeSpan: Span | null = null
  for (let i = 0; i < fs.length; i++)
    for (let j = i + 1; j < fs.length; j++) {
      if (fs[j].x0 - fs[i].x1 > holeWeb + 1e-9) break // sorted by x: nothing further right can be closer
      const [pa, pb, dist] = closestSegSeg(fs[i].a, fs[i].b, fs[j].a, fs[j].b)
      const web = dist - (fs[i].d + fs[j].d) / 2
      if (web <= holeWeb + 1e-9 && dist > 0) {
        const ux = (pb[0] - pa[0]) / dist, uy = (pb[1] - pa[1]) / dist
        holeWeb = Math.min(holeWeb, web)
        holeSpan = [pa[0] + (ux * fs[i].d) / 2, pa[1] + (uy * fs[i].d) / 2, pb[0] - (ux * fs[j].d) / 2, pb[1] - (uy * fs[j].d) / 2]
      }
    }

  const edges = [...geo.outer, ...geo.inner].flatMap((poly) => poly.map((a, i) => [a, poly[(i + 1) % poly.length]] as [Pt, Pt]))
  let edgeWeb = Infinity, edgeSpan: Span | null = null
  for (const f of fs) {
    let best = Infinity, pf: Pt = f.a, pe: Pt = f.a
    for (const [a, b] of edges) {
      // Skip edges whose bounding box is already further away than the best found.
      if (Math.min(a[0], b[0]) - f.x1 > best || f.x0 - Math.max(a[0], b[0]) > best ||
          Math.min(a[1], b[1]) - f.y1 > best || f.y0 - Math.max(a[1], b[1]) > best) continue
      const [p, q, dist] = closestSegSeg(f.a, f.b, a, b)
      if (dist < best) { best = dist; pf = p; pe = q }
    }
    // A feature whose axis sits outside the material is cut open: its web is negative.
    const mid: Pt = [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2]
    const out = !geo.outer.some((o) => inside(mid, o)) || geo.inner.some((o) => inside(mid, o))
    const web = (out ? -best : best) - f.d / 2
    if (web <= edgeWeb + 1e-9) {
      const len = Math.hypot(pe[0] - pf[0], pe[1] - pf[1]) || 1
      edgeWeb = Math.min(edgeWeb, web)
      edgeSpan = [pf[0] + ((pe[0] - pf[0]) / len) * (f.d / 2), pf[1] + ((pe[1] - pf[1]) / len) * (f.d / 2), pe[0], pe[1]]
    }
  }

  let w = 0, h = 0
  for (const poly of geo.outer) for (const [x, y] of poly) { w = Math.max(w, x); h = Math.max(h, y) }
  return { w, h, holeWeb, edgeWeb, holeSpan, edgeSpan, corner: geo.corner,
    types: [...new Set(geo.features.filter((f) => f.d === undefined).map((f) => f.type))],
    own: [...new Set(geo.features.flatMap((f) => (f.d === undefined || f.axle ? [] : [f.d])))].sort((a, b) => a - b),
    axle: geo.features.some((f) => f.axle),
  }
}

export function validate(part: Part, ctx: Ctx): Issue[] {
  if (part.type === 'coupon') return []
  const q = clampPart(part) as GridPart
  const { holeWeb, edgeWeb, types } = measure(q, ctx)
  const min = minWebFor(q, ctx)
  const name = q.type === 'mount' && q.component.minWeb !== undefined && q.component.minWeb < ctx.material.minWeb ? `this ${q.component.name} plate` : ctx.material.name
  // Name the problem, then the changes that fix it for this kind of part.
  const fixes = (extra: (string | false)[]) =>
    [types.includes('technic') && 'switch the hole mix to All M3', ...extra, 'pick a material with a smaller minimum web']
      .filter(Boolean).join(', ').replace(/, ([^,]*)$/, ', or $1')
  const issues: Issue[] = []
  if (holeWeb < min)
    issues.push({
      rule: 'hole-web',
      message: `Only ${holeWeb.toFixed(2)} mm of material between holes; ${name} needs ${min} mm. To fix: ${fixes([
        q.type === 'plate' && 'use the checker pattern',
        q.type === 'disc' && 'use fewer ring holes or a larger diameter',
        q.type === 'angle' && 'use a wider angle',
        q.type === 'curved' && 'use a larger radius',
      ])}.`,
    })
  if (edgeWeb < min)
    issues.push({
      rule: 'edge-web',
      message: `Only ${edgeWeb.toFixed(2)} mm of material between a hole and the edge; ${name} needs ${min} mm. To fix: ${fixes([
        q.type === 'plate' && 'reduce the corner radius',
        q.type === 'frame' && 'widen the border',
      ])}.`,
    })
  // Spec 6, rule 3: the part as cut, plus the spacing on every side, fits the chosen sheet.
  if (ctx.sheet) {
    const k = ctx.material.kerf, { w, h } = measure(q, ctx), s = ctx.sheet
    if (w + k + 2 * s.spacing > s.w || h + k + 2 * s.spacing > s.h)
      issues.push({
        rule: 'sheet-fit',
        message: `This part is ${(w + k).toFixed(1)} × ${(h + k).toFixed(1)} mm, larger than the ${s.w} × ${s.h} mm sheet with ${s.spacing} mm spacing. To fix: choose a larger sheet or make the part smaller.`,
      })
  }
  return issues
}

export function bbox(paths: Path[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const { shape: s } of paths) {
    const pts: Pt[] = s.kind === 'circle' ? [[s.cx - s.r, s.cy - s.r], [s.cx + s.r, s.cy + s.r]] : s.pts
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y)
      x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** The web the rules require: the material's minimum, relaxed only where a component declares a smaller one. */
export function minWebFor(part: Part, ctx: Ctx) {
  const own = part.type === 'mount' ? part.component.minWeb : undefined
  return own !== undefined ? Math.min(own, ctx.material.minWeb) : ctx.material.minWeb
}
