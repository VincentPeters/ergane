import { describe, expect, it } from 'vitest'
import { MATERIALS, PROFILES, bbox, couponKerfs, generate, validate, type Ctx, type Material, type Path } from './geometry'
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
  it('flags holes cut into by a large corner radius', () => {
    const plate = { type: 'plate', cols: 5, rows: 5, pattern: 'full', radius: 15 } as const
    expect(validate(plate, ctx()).map((i) => i.rule)).toEqual(['edge-web'])
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
