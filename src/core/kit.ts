// Kits: a saved list of parts with quantities (spec 9), in the JSON shape of spec 12.
// Kit files and share links are untrusted input: parseKit rebuilds every field through the core's clamps.
import { COMPONENTS } from './components'
import {
  MATERIALS, PROFILES, clampPart, defaultMix, generate, sanitizeMaterial, sanitizeProfile,
  type Ctx, type Fit, type GridPart, type HoleMix, type Material, type Part, type Profile,
} from './geometry'

const BUDGET_CTX: Ctx = { profile: PROFILES[0], material: MATERIALS[0], fit: 'normal' }
import { SHEET_PRESETS, type Sheet } from './layout'

export type KitItem = { part: GridPart; qty: number }
export type Kit = { name: string; profile: Profile; holeMix: HoleMix; material: Material; fit: Fit; sheet: Sheet; items: KitItem[] }

// The fields each part type may carry. Anything else in an imported kit is dropped, so no stray text
// reaches the parts list or the saved kit.
const PART_KEYS: Record<string, string[]> = {
  strip: ['holes', 'rows'], slotted: ['holes', 'slot'], plate: ['cols', 'rows', 'pattern', 'radius'],
  angle: ['armA', 'armB', 'angle'], gusset: ['holes'], frame: ['cols', 'rows', 'border'], connector: ['shape', 'arm'],
  disc: ['diameter', 'count'], curved: ['radius', 'angle'], spacer: ['outer', 'quantity'], bracket: ['cols', 'base', 'height'],
  box: ['cols', 'rows', 'height', 'lid'], nutjoint: ['cols', 'rows', 'bolt'], mount: ['component', 'border'],
  adapter: ['cols8', 'cols127', 'rows'], gear: ['teeth', 'module', 'bore'], rack: ['holes', 'module'],
  wheel: ['diameter', 'groove', 'bore'], pulley: ['teeth', 'bore'],
}
const PART_TYPES = Object.keys(PART_KEYS)
// Ceiling on what a kit may ask the browser to draw, so a hostile file or link cannot freeze the page
// (a loaded kit is also saved and reloaded on every visit).
export const MAX_PIECES = 1000
export const MAX_PATHS = 100_000
const MIXES: HoleMix[] = ['all-m3', 'all-technic', 'alternating', 'border-technic']
const FITS: Fit[] = ['loose', 'normal', 'tight']

export const emptyKit = (name = 'My kit'): Kit => ({
  name, profile: PROFILES[0], holeMix: 'all-m3', material: MATERIALS[0], fit: 'normal',
  sheet: { w: SHEET_PRESETS[1][0], h: SHEET_PRESETS[1][1], spacing: 2 }, items: [],
})

/** Spec 9 starter kit. Strip and plate counts are not in the spec: four of each strip, two of each plate. */
export function starterKit(): Kit {
  const p = (part: GridPart, qty: number): KitItem => ({ part: { ...part, label: true } as GridPart, qty })
  return {
    ...emptyKit('Starter kit'),
    items: [
      ...[3, 5, 7, 11, 15].map((holes) => p({ type: 'strip', holes, rows: 1 }, 4)),
      p({ type: 'plate', cols: 5, rows: 5, pattern: 'full', radius: 2 }, 2),
      p({ type: 'plate', cols: 5, rows: 11, pattern: 'full', radius: 2 }, 2),
      p({ type: 'angle', armA: 5, armB: 5, angle: 90 }, 8),
      p({ type: 'gusset', holes: 4 }, 8),
      p({ type: 'spacer', outer: 8, quantity: 20 }, 1),
      p({ type: 'mount', component: COMPONENTS[0], border: 1 }, 1),
    ],
  }
}

const num = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}

/** The kit as spec-12 JSON: ids plus the values they stood for, parts flattened with their quantity. */
export function kitToJSON(kit: Kit): string {
  const { profile, material } = kit
  return JSON.stringify({
    name: kit.name,
    profile: { id: profile.id, pitch: profile.pitch, hole: profile.hole, ...(profile.custom ? { custom: profile.custom } : {}) },
    holeMix: kit.holeMix,
    material: { id: material.id, name: material.name, thickness: material.thickness, kerf: material.kerf, minWeb: material.minWeb },
    fit: kit.fit,
    parts: kit.items.map((it) => ({ ...it.part, qty: it.qty })),
    sheet: { width: kit.sheet.w, height: kit.sheet.h, spacing: kit.sheet.spacing },
  }, null, 2)
}

/** Reads a kit file or link payload. Unknown part types are dropped; everything else is clamped. */
export function parseKit(json: string): Kit | string {
  let raw: Record<string, unknown>
  try { raw = JSON.parse(json) } catch { return 'This kit is not valid JSON.' }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.parts)) return 'A kit needs a "parts" list.'
  if (raw.parts.length > 300) return 'A kit can hold at most 300 part lines.'
  const id = (v: unknown) => (v && typeof v === 'object' ? (v as { id?: unknown }).id : v)
  const profile = sanitizeProfile(raw.profile)
  const sheet = (raw.sheet ?? {}) as Record<string, unknown>
  const items: KitItem[] = []
  let pieces = 0, paths = 0
  for (const p of raw.parts as Record<string, unknown>[]) {
    if (!p || typeof p !== 'object' || typeof p.type !== 'string' || !PART_TYPES.includes(p.type)) continue
    const fields = Object.fromEntries(PART_KEYS[p.type].filter((k) => k in p).map((k) => [k, p[k]]))
    const part = clampPart({ type: p.type, ...fields, label: p.label === true } as Part) as GridPart
    const qty = Math.round(num(p.qty, 1, 500, 1))
    pieces += qty
    paths += qty * generate(part, BUDGET_CTX).length
    if (pieces > MAX_PIECES) return `A kit can hold at most ${MAX_PIECES} pieces.`
    if (paths > MAX_PATHS) return 'This kit has too many cuts to lay out in the browser. Split it into smaller kits.'
    items.push({ part, qty })
  }
  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : 'Imported kit',
    profile,
    holeMix: MIXES.includes(raw.holeMix as HoleMix) ? (raw.holeMix as HoleMix) : defaultMix(profile),
    material: sanitizeMaterial(raw.material),
    fit: FITS.includes(raw.fit as Fit) ? (raw.fit as Fit) : 'normal',
    sheet: { w: num(sheet.width, 50, 2000, 600), h: num(sheet.height, 50, 2000, 300), spacing: num(sheet.spacing, 0, 20, 2) },
    items,
  }
}

const b64url = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const MAX_KIT_BYTES = 1_000_000 // inflated JSON; a deflate payload can expand a thousandfold
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(stream).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_KIT_BYTES) { await reader.cancel(); throw new Error('kit too large') }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

/** Compact share-link payload: the kit JSON, deflated with the browser's own CompressionStream. */
export async function encodeKit(kit: Kit): Promise<string> {
  return b64url(await pipe(new TextEncoder().encode(kitToJSON(kit)), new CompressionStream('deflate-raw')))
}
export async function decodeKit(payload: string): Promise<Kit | string> {
  try {
    if (payload.length > 50_000) return 'This link is too long to be a kit.'
    return parseKit(new TextDecoder().decode(await pipe(fromB64url(payload), new DecompressionStream('deflate-raw'))))
  } catch {
    return 'This link does not contain a readable kit.'
  }
}
