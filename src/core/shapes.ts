// Shape primitives for the geometry core. Every outline is built from these with a grow distance,
// so kerf offsets stay exact (radius + grow) instead of going through a general polygon offsetter.
import * as pcTypes from 'polygon-clipping'

export type Pt = [number, number]

// The ESM build exports one default object while the bundled types declare named exports;
// take whichever shape the bundler hands over.
const pc = ((pcTypes as unknown as { default?: typeof pcTypes }).default ?? pcTypes)

const TOL = 0.005 // max chord deviation when flattening arcs, mm

/** Points along an arc from a0 to a1 (radians, either direction), both ends included. */
export function arc(c: Pt, r: number, a0: number, a1: number): Pt[] {
  // A multiple of 4 puts vertices on the quarter points of half and full circles, so a part's
  // extreme points (the tip of a strip end, a disc's rim) are exact rather than one chord short.
  const raw = r > TOL ? Math.ceil(Math.abs(a1 - a0) / (2 * Math.acos(1 - TOL / r))) : 1
  const n = Math.max(4, Math.ceil(raw / 4) * 4)
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as Pt
  })
}

export const circle = (c: Pt, r: number): Pt[] => arc(c, r, 0, 2 * Math.PI).slice(0, -1)

/** Capsule of radius r around the segment a–b; a circle when a equals b. */
export function stadium(a: Pt, b: Pt, r: number): Pt[] {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) return circle(a, r)
  const t = Math.atan2(b[1] - a[1], b[0] - a[0])
  return [...arc(b, r, t - Math.PI / 2, t + Math.PI / 2), ...arc(a, r, t + Math.PI / 2, t + 1.5 * Math.PI)]
}

/** A convex polygon of corner centres grown by r: straight sides, round corners (Minkowski sum with a disc). */
export function roundedConvex(centres: Pt[], r: number): Pt[] {
  const c = centres.filter((p, i) => {
    const q = centres[(i + 1) % centres.length]
    return centres.length === 1 || Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-9
  })
  if (c.length <= 1) return circle(c[0] ?? centres[0], r)
  if (c.length === 2) return stadium(c[0], c[1], r)
  const area = c.reduce((s, p, i) => { const q = c[(i + 1) % c.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)
  const pts = area < 0 ? [...c].reverse() : c
  const n = pts.length
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], v = pts[i], q = pts[(i + 1) % n]
    // Outward normals of the edges into and out of v; the corner arc sweeps between them.
    const nIn = Math.atan2(v[1] - p[1], v[0] - p[0]) - Math.PI / 2
    const nOut = Math.atan2(q[1] - v[1], q[0] - v[0]) - Math.PI / 2
    let sweep = (nOut - nIn) % (2 * Math.PI)
    if (sweep < 0) sweep += 2 * Math.PI
    out.push(...arc(v, r, nIn, nIn + sweep))
  }
  return out
}

/** Axis-aligned box of corner centres (x0, y0)–(x1, y1) grown by r. Degenerates to a capsule or circle. */
export const roundedBox = (x0: number, y0: number, x1: number, y1: number, r: number) =>
  roundedConvex([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r)

/** A band of half width w along an arc of radius R around c, from angle a0 to a1, with round ends. */
export function sector(c: Pt, R: number, w: number, a0: number, a1: number): Pt[] {
  const at = (a: number): Pt => [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]
  return [
    ...arc(c, R + w, a0, a1),
    ...arc(at(a1), w, a1, a1 + Math.PI),
    ...arc(c, R - w, a1, a0),
    ...arc(at(a0), w, a0 + Math.PI, a0 + 2 * Math.PI),
  ]
}

/** Union of simple polygons: outer rings, plus any enclosed holes as separate rings. */
export function union(polys: Pt[][]): { outer: Pt[][]; holes: Pt[][] } {
  const [first, ...rest] = polys.map((p) => [p] as pcTypes.Polygon)
  const mp = pc.union(first, ...rest)
  const open = (ring: pcTypes.Ring) => ring.slice(0, -1) as Pt[] // drop the repeated closing point
  return { outer: mp.map((poly) => open(poly[0])), holes: mp.flatMap((poly) => poly.slice(1).map(open)) }
}

/** Even-odd point in polygon test. */
export function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function closestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Closest points between segments a–b and c–d, and their distance (0 where they cross). */
export function closestSegSeg(a: Pt, b: Pt, c: Pt, d: Pt): [Pt, Pt, number] {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d1 / (d1 - d2)
    const x: Pt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
    return [x, x, 0]
  }
  const cands: [Pt, Pt][] = [
    [a, closestOnSeg(a, c, d)], [b, closestOnSeg(b, c, d)],
    [closestOnSeg(c, a, b), c], [closestOnSeg(d, a, b), d],
  ]
  let best: [Pt, Pt, number] = [a, c, Infinity]
  for (const [p, q] of cands) {
    const dist = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (dist < best[2]) best = [p, q, dist]
  }
  return best
}
