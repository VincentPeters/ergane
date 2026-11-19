// Component library for mounting plates. Patterns are data (components.json), so adding a board
// needs no code change; users import more as JSON, which passes through sanitizeComponent first.
// Coordinates are mm, relative to the centre of the hole pattern, y down.
import builtIn from './components.json'

export type Cutout = { shape: 'circle'; x: number; y: number; d: number } | { shape: 'rect'; x: number; y: number; w: number; h: number }
export type ComponentDef = {
  id: string
  name: string
  short?: string // engraved label, a few letters
  fastener?: string
  verify?: boolean // pattern not yet confirmed against a datasheet
  parametric?: boolean // the user may change rect w, h and d
  minWeb?: number // a smaller web this part is known to tolerate (screw ears beside a body cutout), mm
  holes?: { x: number; y: number; d: number }[]
  rect?: { w: number; h: number; d: number } // holes at the corners of w × h (a pair when h is 0)
  cutouts?: Cutout[]
  outline?: { w: number; h: number; x?: number; y?: number } // engraved footprint
}

const fin = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

/** Checks one imported component and returns a clean copy, or the reason it was rejected. */
export function sanitizeComponent(raw: unknown): ComponentDef | string {
  if (!raw || typeof raw !== 'object') return 'Each component must be a JSON object.'
  const c = raw as Record<string, unknown>
  const name = typeof c.name === 'string' ? c.name.trim().slice(0, 60) : ''
  if (typeof c.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(c.id)) return `"id" must be 1–40 lowercase letters, digits or dashes${name ? ` (in ${name})` : ''}.`
  if (!name) return `"name" is missing in ${c.id}.`
  const out: ComponentDef = { id: c.id, name }
  if (typeof c.short === 'string') out.short = c.short.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
  if (typeof c.fastener === 'string') out.fastener = c.fastener.slice(0, 20)
  if (c.verify === true) out.verify = true
  if (c.parametric === true) out.parametric = true
  if (c.minWeb !== undefined) {
    if (!fin(c.minWeb, 0.5, 5)) return `"minWeb" in ${c.id} must be from 0.5 to 5 mm.`
    out.minWeb = c.minWeb as number
  }
  if (c.holes !== undefined) {
    if (!Array.isArray(c.holes) || c.holes.length > 64) return `"holes" in ${c.id} must be a list of at most 64 holes.`
    out.holes = []
    for (const h of c.holes as Record<string, unknown>[]) {
      if (!h || !fin(h.x, -300, 300) || !fin(h.y, -300, 300) || !fin(h.d, 0.5, 60)) return `A hole in ${c.id} needs x and y within ±300 mm and d from 0.5 to 60 mm.`
      out.holes.push({ x: h.x as number, y: h.y as number, d: h.d as number })
    }
  }
  if (c.rect !== undefined) {
    const r = c.rect as Record<string, unknown>
    if (!r || !fin(r.w, 0, 400) || !fin(r.h, 0, 400) || !fin(r.d, 0.5, 60)) return `"rect" in ${c.id} needs w and h from 0 to 400 mm and d from 0.5 to 60 mm.`
    out.rect = { w: r.w as number, h: r.h as number, d: r.d as number }
  }
  if (c.cutouts !== undefined) {
    if (!Array.isArray(c.cutouts) || c.cutouts.length > 16) return `"cutouts" in ${c.id} must be a list of at most 16.`
    out.cutouts = []
    for (const k of c.cutouts as Record<string, unknown>[]) {
      if (!k || !fin(k.x, -300, 300) || !fin(k.y, -300, 300)) return `A cutout in ${c.id} needs x and y within ±300 mm.`
      if (k.shape === 'circle' && fin(k.d, 0.5, 200)) out.cutouts.push({ shape: 'circle', x: k.x as number, y: k.y as number, d: k.d as number })
      else if (k.shape === 'rect' && fin(k.w, 0.5, 300) && fin(k.h, 0.5, 300)) out.cutouts.push({ shape: 'rect', x: k.x as number, y: k.y as number, w: k.w as number, h: k.h as number })
      else return `A cutout in ${c.id} must be a circle with d, or a rect with w and h.`
    }
  }
  if (c.outline !== undefined) {
    const o = c.outline as Record<string, unknown>
    if (!o || !fin(o.w, 1, 400) || !fin(o.h, 1, 400) || (o.x !== undefined && !fin(o.x, -300, 300)) || (o.y !== undefined && !fin(o.y, -300, 300)))
      return `"outline" in ${c.id} needs w and h from 1 to 400 mm.`
    out.outline = { w: o.w as number, h: o.h as number, x: (o.x as number) ?? 0, y: (o.y as number) ?? 0 }
  }
  if (!out.holes?.length && !out.rect && !out.cutouts?.length && !out.outline) return `${c.id} has no holes, cutouts or outline.`
  return out
}

/** Parses a JSON import: one component or a list. Returns the clean components or the first problem. */
export function parseComponents(json: string): ComponentDef[] | string {
  let data: unknown
  try { data = JSON.parse(json) } catch { return 'This file is not valid JSON.' }
  const list = Array.isArray(data) ? data : [data]
  if (list.length > 100) return 'Import at most 100 components at once.'
  const out: ComponentDef[] = []
  for (const raw of list) {
    const c = sanitizeComponent(raw)
    if (typeof c === 'string') return c
    out.push(c)
  }
  return out
}

export const COMPONENTS: ComponentDef[] = (builtIn as unknown[]).map((raw) => {
  const c = sanitizeComponent(raw)
  if (typeof c === 'string') throw new Error(`components.json: ${c}`)
  return c
})

/** All holes of a component, with rect patterns expanded (duplicates dropped for a pair). */
export function componentHoles(c: ComponentDef): { x: number; y: number; d: number }[] {
  const holes = [...(c.holes ?? [])]
  if (c.rect) {
    const { w, h, d } = c.rect
    const seen = new Set<string>()
    for (const [x, y] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
      const k = `${x},${y}`
      if (!seen.has(k)) { seen.add(k); holes.push({ x, y, d }) }
    }
  }
  return holes
}
