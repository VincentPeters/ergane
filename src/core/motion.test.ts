import { describe, expect, it } from 'vitest'
import { MATERIALS, PROFILES, bbox, generate, measure, validate, type Ctx, type GridPart, type Part, type Path } from './geometry'
import { parseKit, kitToJSON, emptyKit } from './kit'
import { GT2, gearOutline, gearRadii, pulleyRadius, rackOutline, PRESSURE_ANGLE } from './motion'

const ctx: Ctx = { profile: PROFILES[0], material: MATERIALS[0], fit: 'normal' }
const outers = (part: Part) => generate(part, ctx).filter((p) => p.op === 'outer')
const circles = (part: Part) => generate(part, ctx).flatMap((p) => (p.shape.kind === 'circle' ? [p.shape] : []))
const polys = (paths: Path[]) => paths.map((p) => (p.shape as { pts: [number, number][] }).pts)

describe('spur gears', () => {
  it('reaches the tip and root circles of its module', () => {
    const { ra, rf } = gearRadii(20, 2)
    const r = gearOutline(20, 2, 0).map(([x, y]) => Math.hypot(x, y))
    expect(Math.max(...r)).toBeCloseTo(ra, 6) // 22
    expect(Math.min(...r)).toBeCloseTo(rf, 6) // 17.5
  })

  it('has one tooth per tooth count', () => {
    const pts = gearOutline(24, 1.5, 0)
    const { ra } = gearRadii(24, 1.5)
    const atTip = pts.map(([x, y]) => Math.hypot(x, y) > ra - 1e-6)
    const runs = atTip.filter((v, i) => v && !atTip[(i - 1 + atTip.length) % atTip.length]).length
    expect(runs).toBe(24)
  })

  it('makes teeth half a circular pitch thick on the pitch circle, so gear and rack mesh', () => {
    // Walk the outline and measure the angular width where it crosses the pitch circle.
    const z = 20, m = 2, { r } = gearRadii(z, m)
    const pts = gearOutline(z, m, 0)
    const crossings: number[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      const ra = Math.hypot(...a) - r, rb = Math.hypot(...b) - r
      if (ra * rb < 0) { const t = ra / (ra - rb); crossings.push(Math.atan2(a[1] + t * (b[1] - a[1]), a[0] + t * (b[0] - a[0]))) }
    }
    const tooth = Math.abs(crossings[1] - crossings[0]) * r // first tooth: leading and trailing flank
    expect(tooth).toBeCloseTo((Math.PI * m) / 2, 2)
    // The rack: tip land is half a pitch minus both flank run-ins over the addendum.
    const rack = rackOutline(0, 100, 10, 0, m, 0)
    const tip = rack.filter(([, y]) => Math.abs(y + 2.25 * m) < 1e-9)
    expect(Math.abs(tip[0][0] - tip[1][0])).toBeCloseTo((Math.PI * m) / 2 - 2 * m * Math.tan(PRESSURE_ANGLE), 6)
  })

  it('grows by half the kerf and validates at the defaults', () => {
    const part: Part = { type: 'gear', teeth: 20, module: 2, bore: 'hole' }
    const b = bbox(outers(part))
    expect(b.w).toBeCloseTo(2 * (gearRadii(20, 2).ra + 0.1), 1)
    expect(validate(part, ctx)).toEqual([])
  })

  it('adds grid holes one pitch from the centre when the gear is big enough', () => {
    expect(circles({ type: 'gear', teeth: 30, module: 2, bore: 'hole' })).toHaveLength(5)
    expect(circles({ type: 'gear', teeth: 12, module: 1.5, bore: 'hole' })).toHaveLength(1)
  })

  it('cuts a Technic axle cross: 4.8 mm across after the cut', () => {
    const part: Part = { type: 'gear', teeth: 20, module: 2, bore: 'axle' }
    const cross = generate(part, ctx).filter((p) => p.op === 'inner' && p.shape.kind === 'poly')
    expect(polys(cross)[0]).toHaveLength(12)
    expect(bbox(cross).w).toBeCloseTo(4.8 - MATERIALS[0].kerf, 6)
    expect(measure(part as GridPart, ctx).axle).toBe(true)
    expect(validate(part, ctx)).toEqual([])
  })
})

describe('racks, wheels and pulleys', () => {
  it('cuts a rack as a holed strip with teeth', () => {
    const part: Part = { type: 'rack', holes: 11, module: 2 }
    expect(circles(part)).toHaveLength(11)
    expect(validate(part, ctx)).toEqual([])
  })

  it('stacks a wheel as flange, core, flange around one bore', () => {
    const o = outers({ type: 'wheel', diameter: 60, groove: 2.5, bore: 'hole' })
    expect(o).toHaveLength(3)
    expect(bbox([o[0]]).w).toBeCloseTo(2 * (32.5 + 0.1), 2)
    expect(bbox([o[1]]).w).toBeCloseTo(2 * (30 + 0.1), 2)
    expect(validate({ type: 'wheel', diameter: 60, groove: 2.5, bore: 'hole' }, ctx)).toEqual([])
  })

  it('makes a GT2 pulley: belt-thick cores plus flanges, pitch diameter from the tooth count', () => {
    const o = outers({ type: 'pulley', teeth: 20, bore: 'hole' })
    expect(o).toHaveLength(2 + Math.ceil(GT2.beltWidth / MATERIALS[0].thickness))
    expect(pulleyRadius(20)).toBeCloseTo(20 * 2 / Math.PI / 2 - 0.254, 6)
    expect(validate({ type: 'pulley', teeth: 20, bore: 'hole' }, ctx)).toEqual([])
    expect(validate({ type: 'pulley', teeth: 12, bore: 'hole' }, ctx).map((i) => i.rule)).toContain('edge-web')
  })

  it('travels in kits', () => {
    const kit = { ...emptyKit(), items: [{ part: { type: 'gear', teeth: 20, module: 2, bore: 'axle' } as GridPart, qty: 2 }] }
    const back = parseKit(kitToJSON(kit))
    if (typeof back === 'string') throw new Error(back)
    expect(back.items[0].part).toMatchObject({ type: 'gear', teeth: 20, bore: 'axle' })
  })
})
