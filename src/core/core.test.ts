import { describe, expect, it } from 'vitest'
import {
  ANGLES, MATERIALS, PROFILES, bbox, clampPart, couponKerfs, generate, measure, validate,
  type Ctx, type GridPart, type Material, type Part, type Path,
} from './geometry'
import { inside, type Pt } from './shapes'
import { toSVG } from './svg'

const acrylic = MATERIALS[0]
const ctx = (material: Material = acrylic, fit: Ctx['fit'] = 'normal'): Ctx => ({ profile: PROFILES[0], material, fit })
const noKerf = { ...acrylic, kerf: 0 }
const strip11 = { type: 'strip', holes: 11, rows: 1 } as const

describe('strip', () => {
  it('11-hole GRID8-M3 strip is 88 x 8 mm nominal', () => {
    const b = bbox(generate(strip11, ctx(noKerf)))
    expect(b.w).toBeCloseTo(88, 3)
    expect(b.h).toBeCloseTo(8, 3)
  })

  it('kerf grows the outline and shrinks holes by half the kerf', () => {
    const paths = generate(strip11, ctx())
    const outer = bbox(paths.filter((p) => p.op === 'outer'))
    expect(outer.w).toBeCloseTo(88.2, 3)
    expect(outer.h).toBeCloseTo(8.2, 3)
    const hole = paths.find((p) => p.op === 'inner')!.shape
    expect(hole.kind === 'circle' && hole.r).toBeCloseTo(1.5, 6) // 3.2/2 - 0.1
  })

  it('fit class offsets the diameter before kerf', () => {
    const hole = generate(strip11, ctx(acrylic, 'loose')).find((p) => p.op === 'inner')!.shape
    expect(hole.kind === 'circle' && hole.r).toBeCloseTo(1.6, 6) // 3.4/2 - 0.1
  })
})

describe('plate patterns', () => {
  const holes = (pattern: 'full' | 'border' | 'checker') =>
    generate({ type: 'plate', cols: 5, rows: 5, pattern, radius: 2 }, ctx()).filter((p) => p.op === 'inner').length
  it('counts holes per pattern', () => {
    expect(holes('full')).toBe(25)
    expect(holes('border')).toBe(16)
    expect(holes('checker')).toBe(13)
  })
})

describe('validation', () => {
  it('passes GRID8-M3 on acrylic', () => {
    expect(validate(strip11, ctx())).toEqual([])
  })
  it('names both web rules on cardboard', () => {
    expect(validate(strip11, ctx(MATERIALS.find((m) => m.id === 'cardboard')!)).map((i) => i.rule)).toEqual(['hole-web', 'edge-web'])
  })
})

const profile = (id: string) => PROFILES.find((p) => p.id === id)!
const radii = (paths: Path[]) => paths.flatMap((p) => (p.shape.kind === 'circle' ? [+p.shape.r.toFixed(3)] : []))

describe('profiles and hole mix', () => {
  it('GRID8-TECHNIC strip is 12 mm wide with 4.8 mm holes', () => {
    const c = { ...ctx(noKerf), profile: profile('GRID8-TECHNIC') }
    const paths = generate(strip11, c)
    const b = bbox(paths)
    expect(b.w).toBeCloseTo(92, 3) // 10 pitches + 12 mm end margins
    expect(b.h).toBeCloseTo(12, 3)
    expect(new Set(radii(paths))).toEqual(new Set([2.4]))
    expect(validate(strip11, c)).toEqual([])
  })

  it('MECCANO strip uses half inch pitch', () => {
    const b = bbox(generate({ type: 'strip', holes: 5, rows: 1 }, { ...ctx(noKerf), profile: profile('MECCANO') }))
    expect(b.w).toBeCloseTo(4 * 12.7 + 12.7, 3)
  })

  it('alternating mix alternates hole types and widens to the Technic width', () => {
    const paths = generate(strip11, { ...ctx(noKerf), holeMix: 'alternating' })
    expect(radii(paths).slice(0, 4)).toEqual([2.4, 1.6, 2.4, 1.6])
    expect(bbox(paths).h).toBeCloseTo(12, 3)
  })

  it('border-technic puts Technic on the border and M3 inside', () => {
    const paths = generate({ type: 'plate', cols: 3, rows: 3, pattern: 'full', radius: 2 }, { ...ctx(noKerf), holeMix: 'border-technic' })
    const r = radii(paths)
    expect(r.filter((x) => x === 2.4).length).toBe(8)
    expect(r[4]).toBe(1.6) // centre hole
  })
})

describe('validation geometry', () => {
  it('locates the smallest webs as spans of the measured length', () => {
    const m = measure(strip11, ctx())
    const len = ([x1, y1, x2, y2]: number[]) => Math.hypot(x2 - x1, y2 - y1)
    expect(len(m.holeSpan!)).toBeCloseTo(m.holeWeb, 6) // 4.8
    expect(len(m.edgeSpan!)).toBeCloseTo(m.edgeWeb, 6) // 2.4
    const corner = measure({ type: 'plate', cols: 5, rows: 5, pattern: 'full', radius: 8 }, ctx())
    expect(corner.edgeWeb).toBeCloseTo(8 - Math.SQRT2 * 4 - 1.6, 1) // nearest edge is the corner arc (flattened to 0.005 mm)
    expect(len(corner.edgeSpan!)).toBeCloseTo(corner.edgeWeb, 6)
  })

  it('flags holes cut into by a large corner radius', () => {
    const plate = { type: 'plate', cols: 5, rows: 5, pattern: 'full', radius: 15 } as const
    expect(validate(plate, ctx()).map((i) => i.rule)).toEqual(['edge-web'])
  })
})

describe('M3 shapes', () => {
  const holesOf = (paths: Path[]) => paths.filter((p) => p.shape.kind === 'circle').map((p) => p.shape as { cx: number; cy: number; r: number })
  const parts: Part[] = [
    { type: 'slotted', holes: 7, slot: 2 },
    ...ANGLES.map((angle): Part => ({ type: 'angle', armA: 4, armB: 4, angle })),
    { type: 'gusset', holes: 4 },
    { type: 'frame', cols: 6, rows: 5, border: 1 },
    ...(['T', 'X', 'H', 'Y'] as const).map((shape): Part => ({ type: 'connector', shape, arm: 2 })),
    { type: 'disc', diameter: 5, count: 8 },
    { type: 'curved', radius: 6, angle: 90 },
  ]

  it.each(parts)('$type $shape$angle builds one outline and passes on acrylic', (part) => {
    const paths = generate(part, ctx())
    expect(paths.filter((p) => p.op === 'outer')).toHaveLength(1)
    expect(validate(part, ctx())).toEqual([])
  })

  it('counts holes per shape', () => {
    const n = (part: Part) => holesOf(generate(part, ctx())).length
    expect(n({ type: 'angle', armA: 5, armB: 5, angle: 90 })).toBe(9) // shared pivot
    expect(n({ type: 'slotted', holes: 7, slot: 2 })).toBe(4) // 2 each side of the slot
    expect(n({ type: 'frame', cols: 6, rows: 5, border: 1 })).toBe(6 * 5 - 4 * 3)
    expect(n({ type: 'connector', shape: 'X', arm: 2 })).toBe(9)
    expect(n({ type: 'connector', shape: 'H', arm: 1 })).toBe(7) // two legs of 3, one bar hole
    expect(n({ type: 'disc', diameter: 5, count: 8 })).toBe(9)
  })

  it('cuts the slot and frame window as inner contours', () => {
    const inner = (part: Part) => generate(part, ctx()).filter((p) => p.op === 'inner' && p.shape.kind === 'poly')
    const slot = inner({ type: 'slotted', holes: 7, slot: 2 })
    expect(slot).toHaveLength(1)
    expect(bbox(slot).w).toBeCloseTo(2 * 8 + 2 * 1.5, 3) // slot length plus kerf-corrected hole width
    expect(inner({ type: 'frame', cols: 6, rows: 5, border: 1 })).toHaveLength(1)
  })

  it('spaces curved strip holes one pitch apart in a straight line', () => {
    const h = holesOf(generate({ type: 'curved', radius: 6, angle: 90 }, ctx()))
    for (let i = 1; i < h.length; i++) expect(Math.hypot(h[i].cx - h[i - 1].cx, h[i].cy - h[i - 1].cy)).toBeCloseTo(8, 6)
  })

  it('grows a union outline by half the kerf on each side', () => {
    const part: Part = { type: 'connector', shape: 'X', arm: 2 }
    const outer = bbox(generate(part, ctx()).filter((p) => p.op === 'outer'))
    expect(outer.w).toBeCloseTo(measure(part as GridPart, ctx()).w + 0.2, 2)
  })

  it('clamps out-of-range parameters instead of breaking', () => {
    expect(clampPart({ type: 'frame', cols: 2, rows: 99, border: 2 })).toMatchObject({ cols: 5, rows: 50 })
    expect(clampPart({ type: 'angle', armA: NaN, armB: 3, angle: 77 })).toMatchObject({ armA: 2, angle: 90 })
    expect(clampPart({ type: 'slotted', holes: 5, slot: 9 })).toMatchObject({ slot: 2 })
  })

  it('flags a crowded disc ring and names the fix', () => {
    const issues = validate({ type: 'disc', diameter: 3, count: 12 }, ctx())
    expect(issues.map((i) => i.rule)).toContain('hole-web')
    expect(issues[0].message).toContain('fewer ring holes')
  })
})

describe('joints', () => {
  const noKerfCtx = () => ctx(noKerf)
  const outers = (part: Part, c = ctx()) => generate(part, c).filter((p) => p.op === 'outer').map((p) => (p.shape as { pts: Pt[] }).pts)
  const holeCount = (part: Part) => generate(part, ctx()).filter((p) => p.shape.kind === 'circle').length

  it('cuts a closed box as six faces and an open one as five, holes on every face', () => {
    const box: Part = { type: 'box', cols: 5, rows: 4, height: 3, lid: 'closed' }
    expect(outers(box)).toHaveLength(6)
    expect(outers({ ...box, lid: 'open' })).toHaveLength(5)
    expect(holeCount(box)).toBe(2 * (5 * 4 + 5 * 3 + 4 * 3))
    expect(validate(box, ctx())).toEqual([])
  })

  it('makes the bracket fingers and notches exactly complementary', () => {
    const [base, up] = outers({ type: 'bracket', cols: 5, base: 3, height: 3 }, noKerfCtx())
    const bb = bbox([{ op: 'outer', shape: { kind: 'poly', pts: base } }])
    const ub = bbox([{ op: 'outer', shape: { kind: 'poly', pts: up } }])
    expect(ub.w).toBeCloseTo(bb.w, 6) // the joined edges have the same length
    const t = acrylic.thickness
    for (let s = 0.25; s < bb.w; s += 0.5) {
      const inBase = inside([bb.x + s, bb.y + t / 2], base)
      const inUp = inside([ub.x + s, ub.y + ub.h - t / 2], up)
      expect(inBase !== inUp).toBe(true) // exactly one piece fills each spot along the joint
    }
  })

  it('keeps face holes a full margin clear of the finger notches', () => {
    const m = measure({ type: 'box', cols: 5, rows: 4, height: 3, lid: 'closed' }, ctx())
    expect(m.edgeWeb).toBeCloseTo(4 - 1.6, 6)
  })

  it('lays out spacers with one hole each and no label between them', () => {
    const part: Part = { type: 'spacer', outer: 8, quantity: 6, label: true }
    const paths = generate(part, ctx())
    expect(paths.filter((p) => p.op === 'outer')).toHaveLength(6)
    expect(paths.filter((p) => p.op === 'engrave')).toHaveLength(0)
    expect(measure(part as GridPart, ctx()).edgeWeb).toBeCloseTo((8 - 3.2) / 2, 2)
  })
})

describe('calibration coupon', () => {
  it('cuts 7 holes per hole type, each a kerf step apart', () => {
    const paths = generate({ type: 'coupon' }, ctx())
    const r = radii(paths)
    expect(r.length).toBe(14) // M3 and Technic rows on a GRID8 profile
    expect(r.slice(0, 7)).toEqual([1.575, 1.55, 1.525, 1.5, 1.475, 1.45, 1.425]) // 3.2/2 - k/2, k = 0.05..0.35
    expect(paths.some((p) => p.op === 'engrave')).toBe(true)
  })

  it('never offers a negative kerf', () => {
    expect(couponKerfs(0)[0]).toBe(0)
    expect(couponKerfs(0.2)).toEqual([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35])
  })
})

describe('labels', () => {
  it('engraves the hole count between the first two holes', () => {
    const paths = generate({ ...strip11, label: true }, ctx())
    const strokes = paths.filter((p) => p.op === 'engrave')
    expect(strokes.length).toBeGreaterThan(0)
    const b = bbox(strokes)
    expect(b.x).toBeGreaterThan(4 + 1.6) // right of hole 1 edge
    expect(b.x + b.w).toBeLessThan(12 - 1.6) // left of hole 2 edge
  })
})

describe('svg', () => {
  it('leaves engrave strokes open', () => {
    const svg = toSVG(generate({ ...strip11, label: true }, ctx()))
    const engraveGroup = svg.slice(svg.indexOf('id="engrave"'), svg.indexOf('id="cut-inner"'))
    expect(engraveGroup).not.toContain('Z"')
  })

  it('uses mm size and puts inner cuts before outer cuts', () => {
    const svg = toSVG(generate(strip11, ctx()))
    expect(svg).toContain('width="88.2mm"')
    expect(svg.indexOf('cut-inner')).toBeLessThan(svg.indexOf('cut-outer'))
  })
})
