// True-shape nesting on a raster (spec 8 sheet layout).
//
// Pieces and sheets become grids of small cells. A piece marks every cell its outline crosses, so the raster
// always covers the real shape; a candidate is grown by the spacing (a square dilation of ceil(spacing / cell)
// cells) before it is tested, so two placed pieces are never closer than the spacing. Large cutouts (frame
// windows, body cutouts, big bores) stay free, which lets small parts nest inside them. Each piece goes to the
// highest, then leftmost, free spot over 0/90/180/270°, on the first sheet with room. Three piece orders always
// run and the result with fewest sheets, then least height, wins, so the same kit always nests the same way
// (the drawer preview and the export agree).
// ponytail: raster bottom-left fill, not no-fit polygons. Gaps can be up to one cell wider than needed; a kit's
// cost grows with sheets × pieces × free positions, fine for the kit limits in kit.ts (1000 pieces). Sheets
// above 1200 mm switch to coarser cells to keep each grid near 2400 cells on its long side (about 6 MB).
import { bbox, type Path } from './geometry'
import { referenceSquare, translate, type Sheet } from './layout'
import { circle, inside, polygonArea, type Pt } from './shapes'

const FINE_CELL = 0.5 // mm
const MAX_CELLS = 2400 // cells along a sheet's long side
// A cutout must clear the spacing on both sides plus 6 mm, the narrowest part in the library (an 8 mm strip
// less its kerf and a margin), to be worth holding another part.
const MIN_NEST = 6

type Grid = { w: number; h: number; cells: Uint8Array }

const ring = (p: Path): Pt[] | null =>
  p.shape.kind === 'circle' ? circle([p.shape.cx, p.shape.cy], p.shape.r) : p.shape.kind === 'poly' ? p.shape.pts : null

/** Sets cells whose centre is inside the ring (even-odd scanline per cell row). */
function fill(g: Grid, pts: Pt[], v: number, cell: number) {
  for (let j = 0; j < g.h; j++) {
    const y = (j + 0.5) * cell
    const xs: number[] = []
    for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[i]
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
    }
    xs.sort((a, b) => a - b)
    for (let n = 0; n + 1 < xs.length; n += 2) {
      const a = Math.max(0, Math.ceil(xs[n] / cell - 0.5)), b = Math.min(g.w - 1, Math.floor(xs[n + 1] / cell - 0.5))
      for (let i = a; i <= b; i++) g.cells[j * g.w + i] = v
    }
  }
}

/** Marks every cell each edge of the ring passes through (grid traversal), so no sliver of outline is missed. */
function edges(g: Grid, pts: Pt[], cell: number) {
  const mark = (i: number, j: number) => { if (i >= 0 && j >= 0 && i < g.w && j < g.h) g.cells[j * g.w + i] = 1 }
  for (let n = 0, k = pts.length - 1; n < pts.length; k = n++) {
    const x = pts[k][0] / cell, y = pts[k][1] / cell, dx = pts[n][0] / cell - x, dy = pts[n][1] / cell - y
    let i = Math.floor(x), j = Math.floor(y)
    const ie = Math.floor(x + dx), je = Math.floor(y + dy), sx = Math.sign(dx), sy = Math.sign(dy)
    let tx = sx ? ((sx > 0 ? i + 1 : i) - x) / dx : Infinity, ty = sy ? ((sy > 0 ? j + 1 : j) - y) / dy : Infinity
    const ddx = sx ? sx / dx : Infinity, ddy = sy ? sy / dy : Infinity
    mark(i, j)
    for (let steps = Math.abs(ie - i) + Math.abs(je - j); steps > 0 && (i !== ie || j !== je); steps--) {
      if (tx < ty) { i += sx; tx += ddx } else if (ty < tx) { j += sy; ty += ddy } else {
        mark(i + sx, j); mark(i, j + sy) // through a cell corner: both neighbours touch the line
        i += sx; j += sy; tx += ddx; ty += ddy; steps--
      }
      mark(i, j)
    }
  }
}

/** Splits a generated part into pieces: one outer outline each, with the holes, cutouts and text inside it. */
export function splitPieces(paths: Path[]): Path[][] {
  const outers = paths.filter((p) => p.op === 'outer')
  if (outers.length <= 1) return [paths]
  const rings = outers.map((o) => ring(o)!), areas = rings.map((r) => Math.abs(polygonArea(r)))
  const groups = outers.map((o) => [o])
  for (const p of paths) {
    if (p.op === 'outer') continue
    const at: Pt = p.shape.kind === 'circle' ? [p.shape.cx, p.shape.cy] : p.shape.pts[0]
    // The smallest outline around the point owns it, should one outline ever sit inside another.
    let owner = 0
    rings.forEach((r, i) => { if (inside(at, r) && (!inside(at, rings[owner]) || areas[i] < areas[owner])) owner = i })
    groups[owner].push(p)
  }
  return groups
}

const turn = ([x, y]: Pt, r: number): Pt => (r === 0 ? [x, y] : r === 1 ? [-y, x] : r === 2 ? [-x, -y] : [y, -x])
function rotate(paths: Path[], r: number): Path[] {
  const out = paths.map((p): Path => {
    const s = p.shape
    if (s.kind === 'circle') { const [cx, cy] = turn([s.cx, s.cy], r); return { op: p.op, shape: { ...s, cx, cy } } }
    return { op: p.op, shape: { ...s, pts: s.pts.map((q) => turn(q, r)) } }
  })
  const b = bbox(out)
  return out.map((p) => translate(p, -b.x, -b.y))
}

/** A cutout large enough to hold another part. */
const isHost = (p: Path, spacing: number) => {
  if (p.op !== 'inner' || p.shape.kind === 'line') return false
  const b = bbox([p])
  return Math.min(b.w, b.h) >= MIN_NEST + 2 * spacing
}

/** Square dilation by `pad` cells along one axis: `stride` 1 for rows, the row width for columns. */
function dilate(src: Uint8Array, len: number, lines: number, stride: number, lineStep: number, pad: number, out: Uint8Array, outStride: number, outLineStep: number) {
  for (let l = 0; l < lines; l++)
    for (let i = 0; i < len; i++)
      if (src[l * lineStep + i * stride]) for (let d = 0; d <= 2 * pad; d++) out[l * outLineStep + (i + d) * outStride] = 1
}

type Shape = {
  paths: Path[] // rotated, top-left at (0, 0)
  solid: Grid // cells the piece occupies (large cutouts left free)
  spans: [number, number][][] // per row of the spacing-grown mask, the filled runs [a, b)
  w: number; h: number // size of the grown mask in cells
  pad: number // cells of growth on each side
  area: number // material area, mm²
}

function shapeOf(paths: Path[], spacing: number, cell: number): Shape {
  const b = bbox(paths)
  const solid: Grid = { w: Math.ceil(b.w / cell) + 1, h: Math.ceil(b.h / cell) + 1, cells: new Uint8Array(0) }
  solid.cells = new Uint8Array(solid.w * solid.h)
  let area = 0
  const carve = (pts: Pt[], v: number) => { fill(solid, pts, v, cell); edges(solid, pts, cell); area += (v ? 1 : -1) * Math.abs(polygonArea(pts)) }
  for (const p of paths) if (p.op === 'outer') carve(ring(p)!, 1)
  for (const p of paths) if (isHost(p, spacing)) carve(ring(p)!, 0) // edges() keeps the cutout's rim solid
  const pad = Math.ceil(spacing / cell - 1e-9)
  const W = solid.w + 2 * pad, H = solid.h + 2 * pad
  const rows = new Uint8Array(W * solid.h), grown = new Uint8Array(W * H)
  dilate(solid.cells, solid.w, solid.h, 1, solid.w, pad, rows, 1, W) // along rows
  dilate(rows, solid.h, W, W, 1, pad, grown, W, 1) // along columns
  const spans: [number, number][][] = []
  for (let j = 0; j < H; j++) {
    const row: [number, number][] = []
    for (let i = 0; i < W; i++) {
      if (!grown[j * W + i]) continue
      let e = i
      while (e < W && grown[j * W + e]) e++
      row.push([i, e]); i = e // continue after the run
    }
    spans.push(row)
  }
  return { paths, solid, spans, w: W, h: H, pad, area }
}

/** A sheet being filled: occupied cells, with per-row prefix counts so a run can be tested in O(1). */
class Board {
  cols: number; rows: number; occ: Uint8Array; pre: Int32Array
  placed: { piece: number; paths: Path[] }[] = []
  bottom = 0 // mm, lowest edge used
  used = 0 // mm² of part on the sheet
  constructor(sheet: Sheet, readonly cell: number) {
    this.cols = Math.floor(sheet.w / cell); this.rows = Math.floor(sheet.h / cell)
    this.occ = new Uint8Array(this.cols * this.rows); this.pre = new Int32Array((this.cols + 1) * this.rows)
  }
  private count(j: number, a: number, b: number) { const o = j * (this.cols + 1); return this.pre[o + b] - this.pre[o + a] }
  /** Rightmost occupied cell in [a, b) of row j, by halving on the prefix counts. */
  private lastOcc(j: number, a: number, b: number) {
    let lo = a, hi = b
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.count(j, mid, b) > 0) lo = mid; else hi = mid }
    return lo
  }
  /** Highest, then leftmost, spot where the grown mask fits; null when the sheet has no room. */
  find(s: Shape): [number, number] | null {
    for (let y = 0; y + s.h <= this.rows; y++) {
      let x = 0
      while (x + s.w <= this.cols) {
        let next = -1
        for (let r = 0; r < s.h && next < 0; r++)
          for (const [a, b] of s.spans[r])
            if (this.count(y + r, x + a, x + b) > 0) { next = this.lastOcc(y + r, x + a, x + b) - a + 1; break }
        if (next < 0) return [x, y]
        x = Math.max(x + 1, next) // every shift before `next` still hits the same occupied cell
      }
    }
    return null
  }
  /** Marks the piece's own cells (not the spacing) as taken. */
  mark(s: Shape, x: number, y: number) {
    const ox = x + s.pad, oy = y + s.pad
    for (let j = 0; j < s.solid.h; j++) {
      const row = oy + j
      for (let i = 0; i < s.solid.w; i++) if (s.solid.cells[j * s.solid.w + i]) this.occ[row * this.cols + ox + i] = 1
      const o = row * (this.cols + 1)
      for (let i = 0; i < this.cols; i++) this.pre[o + i + 1] = this.pre[o + i] + this.occ[row * this.cols + i]
    }
  }
  place(s: Shape, x: number, y: number, piece: number) {
    this.mark(s, x, y)
    this.placed.push({ piece, paths: s.paths.map((p) => translate(p, (x + s.pad) * this.cell, (y + s.pad) * this.cell)) })
    this.bottom = Math.max(this.bottom, (y + s.h) * this.cell)
    this.used += s.area
  }
}

export type Nested = {
  sheets: Path[][] // per sheet, in cut order
  placed: { piece: number; sheet: number }[]
  tooBig: number[]
  usage: number[] // share of each sheet's area that is part, 0 to 1
}

/** Nests pieces onto as few sheets as it can. Identical pieces (the same array) are rasterised once. */
export function nest(pieces: Path[][], sheet: Sheet, opts: { refSquare?: boolean } = {}): Nested {
  const s = sheet.spacing
  const cell = Math.max(FINE_CELL, Math.max(sheet.w, sheet.h) / MAX_CELLS)
  const cache = new Map<Path[], Shape[]>()
  const shapes = pieces.map((p) => {
    if (!cache.has(p)) cache.set(p, [0, 1, 2, 3].map((r) => shapeOf(rotate(p, r), s, cell)))
    return cache.get(p)!
  })
  const area = (i: number) => shapes[i][0].area
  const longSide = (i: number) => Math.max(shapes[i][0].w, shapes[i][0].h)
  const boxArea = (i: number) => shapes[i][0].w * shapes[i][0].h
  const square = opts.refSquare ? shapeOf([{ ...referenceSquare(0, 0), op: 'outer' }], s, cell) : null // only reserves room

  let best: { boards: Board[]; tooBig: number[]; cost: number } | null = null
  for (const key of [area, longSide, boxArea]) {
    const boards: Board[] = [], tooBig: number[] = []
    const open = () => { const b = new Board(sheet, cell); if (square) b.mark(square, 0, 0); boards.push(b); return b }
    // On a board, the rotation whose grown mask ends highest, then leftmost.
    const tryOn = (b: Board, i: number) => {
      const pick = shapes[i].flatMap((sh) => { const at = b.find(sh); return at ? [{ sh, at }] : [] })
        .sort((p, q) => p.at[1] + p.sh.h - (q.at[1] + q.sh.h) || p.at[0] - q.at[0])[0]
      if (pick) b.place(pick.sh, pick.at[0], pick.at[1], i)
      return !!pick
    }
    for (const i of [...pieces.keys()].sort((a, b) => key(b) - key(a))) {
      if (boards.some((b) => tryOn(b, i))) continue
      if (!tryOn(open(), i)) { boards.pop(); tooBig.push(i) }
    }
    const cost = boards.length * 1e9 + (boards.at(-1)?.bottom ?? 0)
    if (!best || cost < best.cost) best = { boards, tooBig, cost }
  }
  const { boards, tooBig } = best!
  const offset = square ? square.pad * cell : 0
  return {
    sheets: boards.map((b) => [...(square ? [referenceSquare(offset, offset)] : []), ...cutOrder(b)]),
    placed: boards.flatMap((b, n) => b.placed.map((p) => ({ piece: p.piece, sheet: n }))),
    tooBig,
    usage: boards.map((b) => b.used / (sheet.w * sheet.h)),
  }
}

/**
 * Orders a sheet for cutting. Inner cuts run before outer cuts, but a cutout that holds other parts must not
 * free its slug before those parts are cut: it moves to the outer cuts (the cut-outer layer), after the parts
 * inside it and before its own piece's outline. Deeper parts cut first.
 */
function cutOrder(b: Board): Path[] {
  const pieces = b.placed.map((p) => ({ paths: p.paths, outer: ring(p.paths.find((q) => q.op === 'outer')!)! }))
  const depth = pieces.map(() => 0)
  const promoted = new Set<Path>()
  for (const host of pieces)
    for (const cut of host.paths) {
      const c = cut.op === 'inner' ? ring(cut) : null
      if (c) pieces.forEach((other, k) => { if (other !== host && other.outer.every((pt) => inside(pt, c))) { depth[k]++; promoted.add(cut) } })
    }
  const rest: Path[] = [], outers: { path: Path; d: number }[] = []
  pieces.forEach((p, k) => p.paths.forEach((q) => {
    if (q.op === 'outer') outers.push({ path: q, d: depth[k] })
    else if (promoted.has(q)) outers.push({ path: { ...q, op: 'outer' }, d: depth[k] + 0.5 }) // after the parts inside, before its own outline
    else rest.push(q)
  }))
  return [...rest, ...outers.sort((a, c) => c.d - a.d).map((o) => o.path)]
}
