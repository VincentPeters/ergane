import { describe, expect, it } from 'vitest'
import { MATERIALS, PROFILES, bbox, generate, type Ctx, type Part, type Path } from './geometry'
import { nest, splitPieces } from './nest'
import { closestSegSeg, inside, type Pt } from './shapes'

const ctx: Ctx = { profile: PROFILES[0], material: MATERIALS[0], fit: 'normal' }
const pieces = (part: Part, n = 1) => Array.from({ length: n }, () => splitPieces(generate(part, ctx))).flat()
const ring = (p: Path): Pt[] => (p.shape.kind === 'poly' ? p.shape.pts : [])
const edgesOf = (pts: Pt[]) => pts.map((a, i) => [a, pts[(i + 1) % pts.length]] as [Pt, Pt])
function gap(a: Pt[], b: Pt[]) {
  let best = Infinity
  for (const [p, q] of edgesOf(a)) for (const [r, s] of edgesOf(b)) best = Math.min(best, closestSegSeg(p, q, r, s)[2])
  return best
}
const outlines = (sheet: Path[]) => sheet.filter((p) => p.op === 'outer' && p.shape.kind === 'poly').map(ring)

describe('splitting parts into pieces', () => {
  it('gives each box face its own piece with its own holes', () => {
    const faces = splitPieces(generate({ type: 'box', cols: 5, rows: 4, height: 3, lid: 'closed' }, ctx))
    expect(faces).toHaveLength(6)
    faces.forEach((f) => expect(f.filter((p) => p.op === 'outer')).toHaveLength(1))
    expect(faces.reduce((n, f) => n + f.filter((p) => p.shape.kind === 'circle').length, 0)).toBe(2 * (20 + 15 + 12))
  })
})

describe('true-shape nesting', () => {
  it('never puts two pieces closer than the spacing, and keeps them on the sheet', () => {
    const all = [...pieces({ type: 'angle', armA: 5, armB: 5, angle: 90 }, 4), ...pieces({ type: 'gusset', holes: 4 }, 4),
      ...pieces({ type: 'strip', holes: 7, rows: 1 }, 6), ...pieces({ type: 'disc', diameter: 5, count: 8 }, 2)]
    const sheet = { w: 300, h: 200, spacing: 2 }
    const out = nest(all, sheet)
    expect(out.tooBig).toEqual([])
    for (const s of out.sheets) {
      const o = outlines(s)
      const b = bbox(s)
      expect(b.x).toBeGreaterThanOrEqual(sheet.spacing - 1e-9)
      expect(b.y).toBeGreaterThanOrEqual(sheet.spacing - 1e-9)
      expect(b.x + b.w).toBeLessThanOrEqual(sheet.w - sheet.spacing + 1e-9)
      expect(b.y + b.h).toBeLessThanOrEqual(sheet.h - sheet.spacing + 1e-9)
      for (let i = 0; i < o.length; i++) for (let j = i + 1; j < o.length; j++) expect(gap(o[i], o[j])).toBeGreaterThanOrEqual(sheet.spacing - 1e-6)
    }
  })

  it('nests parts inside a frame window and cuts that window after them', () => {
    const frame = pieces({ type: 'frame', cols: 9, rows: 7, border: 1 })
    const strips = pieces({ type: 'strip', holes: 4, rows: 1 }, 3)
    const out = nest([...frame, ...strips], { w: 90, h: 70, spacing: 2 }) // only room for the frame itself
    expect(out.tooBig).toEqual([])
    expect(out.sheets).toHaveLength(1)
    const s = out.sheets[0]
    const order = s.filter((p) => p.op === 'outer')
    const window = order.find((p) => order.some((q) => q !== p && ring(q).length && ring(q).every((pt) => inside(pt, ring(p)))))!
    expect(window).toBeDefined()
    const idx = (p: Path) => order.indexOf(p)
    const inner = order.filter((q) => q !== window && ring(q).every((pt) => inside(pt, ring(window))))
    const frameOutline = order.find((q) => ring(window).every((pt) => inside(pt, ring(q))))!
    inner.forEach((q) => expect(idx(q)).toBeLessThan(idx(window))) // parts inside are cut first
    expect(idx(window)).toBeLessThan(idx(frameOutline)) // the frame's own outline is cut last
  })

  it('marks every cell an outline grazes, even a sliver of a corner', () => {
    // A tiny triangle clipping a cell corner by under 0.1 mm must still keep the full spacing to its neighbour.
    const sliver = [{ op: 'outer' as const, shape: { kind: 'poly' as const, pts: [[0.45, 0], [1.2, 0], [1.2, 0.08]] as Pt[] } }]
    const block = pieces({ type: 'plate', cols: 2, rows: 2, pattern: 'full', radius: 0 })
    const out = nest([block[0], sliver], { w: 40, h: 40, spacing: 2 })
    const [a, b] = outlines(out.sheets[0])
    expect(gap(a, b)).toBeGreaterThanOrEqual(2 - 1e-6)
  })

  it('stays bounded on the largest sheet a kit allows', () => {
    const t0 = Date.now()
    const out = nest(pieces({ type: 'strip', holes: 11, rows: 1 }, 40), { w: 2000, h: 2000, spacing: 2 })
    expect(out.sheets).toHaveLength(1)
    expect(Date.now() - t0).toBeLessThan(3000)
  })

  it('turns a part a quarter turn when that is the only way it fits', () => {
    const long = pieces({ type: 'strip', holes: 15, rows: 1 }) // 120 mm long
    expect(nest(long, { w: 30, h: 140, spacing: 2 }).tooBig).toEqual([])
  })

  it('interlocks two gussets head to tail where their boxes would not fit', () => {
    const g = pieces({ type: 'gusset', holes: 4 }, 2) // each about 32 × 32 mm
    // Round 4 mm corners put the long edge 4·√2 mm out, so an interlocked pair is about 39 mm square;
    // side by side (70 mm) or stacked (68 mm) they cannot fit this sheet.
    const out = nest(g, { w: 46, h: 48, spacing: 2 })
    expect(out.tooBig).toEqual([])
    expect(out.sheets).toHaveLength(1)
  })

  it('reserves a corner for the reference square', () => {
    const out = nest(pieces({ type: 'strip', holes: 5, rows: 1 }), { w: 100, h: 50, spacing: 2 }, { refSquare: true })
    const sq = out.sheets[0].find((p) => p.op === 'engrave' && p.shape.kind === 'poly' && ring(p).length === 4)!
    expect(bbox([sq]).w).toBeCloseTo(10, 6)
    const strip = outlines(out.sheets[0])[0]
    expect(gap(ring(sq), strip)).toBeGreaterThanOrEqual(2 - 1e-6)
  })
})
