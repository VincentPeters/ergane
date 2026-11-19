import { describe, expect, it } from 'vitest'
import { MATERIALS, PROFILES, bbox, generate, validate, type Ctx, type Material } from './geometry'
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

describe('svg', () => {
  it('uses mm size and puts inner cuts before outer cuts', () => {
    const svg = toSVG(generate(strip11, ctx()))
    expect(svg).toContain('width="88.2mm"')
    expect(svg.indexOf('cut-inner')).toBeLessThan(svg.indexOf('cut-outer'))
  })
})
