// Outlines for motion parts (M6): involute spur gears, matching racks and GT2 belt pulleys.
// Each takes the grow distance g like every other outline, so kerf compensation stays in one place.
// ponytail: flanks grow tangentially by g/R instead of along their true normal; on an involute the
// difference is under 7 % of g (about 0.007 mm at 0.2 mm kerf). Use a real offsetter if backlash matters.
import { arc, circle, difference, type Pt } from './shapes'

export const PRESSURE_ANGLE = (20 * Math.PI) / 180
const inv = (a: number) => Math.tan(a) - a

/** Pitch, base, tip and root radii of a spur gear of z teeth and module m. */
export const gearRadii = (z: number, m: number) => {
  const r = (m * z) / 2
  return { r, rb: r * Math.cos(PRESSURE_ANGLE), ra: r + m, rf: r - 1.25 * m }
}

/** Involute spur gear outline, centred on (0, 0). */
export function gearOutline(z: number, m: number, g: number): Pt[] {
  const { rb, ra, rf } = gearRadii(z, m)
  const psiP = Math.PI / (2 * z) // half tooth angle on the pitch circle
  // Half tooth angle at radius R, widened by g along the circle.
  const psi = (R: number) => Math.max(0, psiP + inv(PRESSURE_ANGLE) - inv(Math.acos(Math.min(1, rb / R))) + g / R)
  const r0 = Math.max(rb, rf), steps = 10
  const radii = Array.from({ length: steps + 1 }, (_, i) => r0 + ((ra - r0) * i) / steps)
  const R = { tip: ra + g, root: rf + g }
  const pts: Pt[] = []
  const at = (rad: number, a: number): Pt => [rad * Math.cos(a), rad * Math.sin(a)]
  for (let k = 0; k < z; k++) {
    const t = (2 * Math.PI * k) / z, next = (2 * Math.PI * (k + 1)) / z
    radii.forEach((rad) => pts.push(at(rad === ra ? R.tip : rad, t - psi(rad)))) // leading flank, root to tip
    pts.push(...arc([0, 0], R.tip, t - psi(ra), t + psi(ra)).slice(1, -1)) // tip land
    ;[...radii].reverse().forEach((rad) => pts.push(at(rad === ra ? R.tip : rad, t + psi(rad)))) // trailing flank
    // Below the base circle the flank runs radially down to the root, then the root arc reaches the next tooth.
    const a0 = t + psi(r0), a1 = next - psi(r0)
    pts.push(...arc([0, 0], R.root, a0, a1))
  }
  return pts
}

/**
 * Rack teeth along the top of a straight body from x0 to x1, root line at yRoot (y down, teeth point up).
 * Teeth that would run past either end are left off, so the ends stay solid.
 */
export function rackOutline(x0: number, x1: number, yBottom: number, yRoot: number, m: number, g: number): Pt[] {
  const P = Math.PI * m, ta = Math.tan(PRESSURE_ANGLE)
  const yPitch = yRoot - 1.25 * m, yTip = yRoot - 2.25 * m - g, yR = yRoot - g
  // Half tooth width at height y: half the pitch-line thickness plus the flank slope, widened by g normal to the flank.
  const w = (y: number) => Math.max(0, P / 4 + (y - yPitch) * ta + g / Math.cos(PRESSURE_ANGLE))
  const centres: number[] = []
  for (let c = x0 + P / 2; c + w(yR) <= x1 + 1e-9; c += P) if (c - w(yR) >= x0 - 1e-9) centres.push(c)
  const pts: Pt[] = [[x0 - g, yBottom + g], [x1 + g, yBottom + g], [x1 + g, yR]]
  for (const c of centres.reverse()) pts.push([c + w(yR), yR], [c + w(yTip), yTip], [c - w(yTip), yTip], [c - w(yR), yR])
  pts.push([x0 - g, yR])
  return pts
}

/** GT2 belt: 2 mm pitch, pitch line 0.254 mm outside the pulley, teeth 0.75 mm deep with a 0.555 mm radius. */
export const GT2 = { pitch: 2, plo: 0.254, depth: 0.75, radius: 0.555, beltWidth: 6 }
export const pulleyRadius = (z: number) => (z * GT2.pitch) / Math.PI / 2 - GT2.plo

/** GT2 pulley core: a disc with one round-bottomed groove per belt tooth. */
export function pulleyOutline(z: number, g: number): Pt[] {
  const R = pulleyRadius(z), rc = R - GT2.depth + GT2.radius
  const grooves = Array.from({ length: z }, (_, k) => {
    const t = (2 * Math.PI * k) / z
    return circle([rc * Math.cos(t), rc * Math.sin(t)], Math.max(0.05, GT2.radius - g))
  })
  return difference(circle([0, 0], R + g), grooves)[0]
}

/** Technic axle cross (spec 3.2): 4.8 mm across, 1.8 mm arms, as a cutout shrunk by g. */
export function axleCross(cx: number, cy: number, fit: number, g: number): Pt[] {
  const L = 2.4 + fit / 2 - g, W = 0.9 + fit / 2 - g
  return [[W, -L], [W, -W], [L, -W], [L, W], [W, W], [W, L], [-W, L], [-W, W], [-L, W], [-L, -W], [-W, -W], [-W, -L]]
    .map(([x, y]) => [cx + x, cy + y] as Pt)
}
/** Diameter of the circle around the axle cross, for web checks. */
export const AXLE_D = 2 * Math.hypot(2.4, 0.9)
