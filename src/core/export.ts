// Turns parts and kits into the files a laser operator downloads, per machine profile (spec 8).
import { toDXF } from './dxf'
import {
  MATERIALS, PROFILES, generate, validate, type Ctx, type GridPart, type Issue, type Path,
} from './geometry'
import type { Kit } from './kit'
import { pack, referenceSquare } from './layout'
import { toPDF } from './pdf'
import { DEFAULT_COLORS, toSVG, type Colors, type ExportOpts } from './svg'

export type Format = 'svg' | 'dxf' | 'pdf'
/** How one laser wants its files. Saved by the user; the default suits LightBurn, Inkscape and Illustrator. */
export type Machine = {
  id: string
  name: string
  colors: Colors
  split: 'layers' | 'per-op' | 'single' // one file with layers, one file per operation, or one colour for all
  refSquare: boolean
}
export const DEFAULT_MACHINE: Machine = { id: 'default', name: 'Default', colors: DEFAULT_COLORS, split: 'layers', refSquare: false }

export type OutFile = { name: string; data: string }

const HEX = /^#[0-9a-fA-F]{6}$/
/** Checks a stored or imported machine profile and returns a clean copy, or null. */
export function sanitizeMachine(raw: unknown): Machine | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>, c = (m.colors ?? {}) as Record<string, unknown>
  if (typeof m.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(m.id) || typeof m.name !== 'string') return null
  const color = (k: keyof Colors) => (typeof c[k] === 'string' && HEX.test(c[k] as string) ? (c[k] as string).toUpperCase() : DEFAULT_COLORS[k])
  return {
    id: m.id, name: m.name.slice(0, 40),
    colors: { engrave: color('engrave'), inner: color('inner'), outer: color('outer') },
    split: m.split === 'per-op' || m.split === 'single' ? m.split : 'layers',
    refSquare: m.refSquare === true,
  }
}

/** Renders one drawing (a part, or one sheet) in a format, split as the machine wants it. */
function render(base: string, pages: { paths: Path[]; sheet?: { w: number; h: number } }[], format: Format, machine: Machine): OutFile[] {
  const variants: [string, ExportOpts][] =
    machine.split === 'per-op' ? [['engrave', { ops: ['engrave'] }], ['cut-inner', { ops: ['inner'] }], ['cut-outer', { ops: ['outer'] }]]
    : machine.split === 'single' ? [['', { single: true }]] : [['', {}]]
  const out: OutFile[] = []
  for (const [suffix, v] of variants) {
    const opts: ExportOpts = { ...v, colors: machine.colors }
    const name = suffix ? `${base}-${suffix}` : base
    // An operation with nothing in it gets no file (a part without labels has no engrave file).
    const keep = (paths: Path[]) => paths.filter((p) => !opts.ops || opts.ops.includes(p.op))
    if (!pages.some((p) => keep(p.paths).length)) continue
    if (format === 'pdf') out.push({ name: `${name}.pdf`, data: toPDF(pages, opts) })
    else pages.forEach((p, i) => {
      const n = pages.length > 1 ? `${name}-sheet-${String(i + 1).padStart(2, '0')}` : name
      out.push({ name: `${n}.${format}`, data: format === 'svg' ? toSVG(p.paths, { ...opts, sheet: p.sheet }) : toDXF(p.paths, { ...opts, sheet: p.sheet }) })
    })
  }
  return out
}

/** Files for the part on screen. The reference square, when on, sits 4 mm left of the part. */
export function exportPart(name: string, paths: Path[], format: Format, machine: Machine): OutFile[] {
  let all = paths
  if (machine.refSquare) {
    const xs = paths.flatMap((p) => (p.shape.kind === 'circle' ? [p.shape.cx - p.shape.r] : p.shape.pts.map(([x]) => x)))
    const ys = paths.flatMap((p) => (p.shape.kind === 'circle' ? [p.shape.cy - p.shape.r] : p.shape.pts.map(([, y]) => y)))
    all = [...paths, referenceSquare(Math.min(...xs) - 14, Math.min(...ys))]
  }
  return render(name, [{ paths: all }], format, machine)
}

/** The context a kit cuts with on this machine: the kit's material with the kerf calibrated here. */
export function kitCtx(kit: Kit, kerf: number): Ctx {
  const material = MATERIALS.find((m) => m.id === kit.material) ?? MATERIALS[0]
  return { profile: PROFILES.find((p) => p.id === kit.profile) ?? PROFILES[0], material: { ...material, kerf }, fit: kit.fit, holeMix: kit.holeMix }
}

export type KitCheck = { line: number; issues: Issue[] }[]
/** Rule failures per kit line, plus parts too big for the sheet (spec 6, rule 3). */
export function checkKit(kit: Kit, ctx: Ctx): { failed: KitCheck; layout: ReturnType<typeof layoutKit> } {
  const failed = kit.items.map((it, line) => ({ line, issues: validate(it.part, ctx) })).filter((f) => f.issues.length)
  return { failed, layout: layoutKit(kit, ctx, false) }
}

/** Generates every piece of the kit (each quantity a separate piece) and packs them onto sheets. */
export function layoutKit(kit: Kit, ctx: Ctx, refSquare: boolean) {
  const pieces: Path[][] = [], lineOf: number[] = []
  kit.items.forEach((it, line) => {
    const paths = generate(it.part, ctx)
    for (let k = 0; k < it.qty; k++) { pieces.push(paths); lineOf.push(line) }
  })
  const packed = pack(pieces, kit.sheet, refSquare ? { w: 10, h: 10 } : undefined)
  return { ...packed, tooBigLines: [...new Set(packed.tooBig.map((i) => lineOf[i]))] }
}

/** Short ID per kit line (P01, P02, …), used in the parts list and on screen. */
export const partId = (line: number) => `P${String(line + 1).padStart(2, '0')}`

/** Spec 8 parts list: part ID, type, parameters, quantity. */
export function partsCSV(kit: Kit): string {
  // A cell that starts like a formula is prefixed with ' so spreadsheets show it as text instead of running it.
  const cell = (raw: string) => {
    const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  const params = (p: GridPart) => Object.entries(p)
    .filter(([k]) => k !== 'type')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? (v as { id?: string }).id ?? JSON.stringify(v) : v}`).join('; ')
  return ['part_id,type,parameters,quantity', ...kit.items.map((it, i) => [partId(i), it.part.type, params(it.part), String(it.qty)].map(cell).join(','))].join('\n') + '\n'
}

/** Every file of a kit export: sheets in the chosen format, the parts list and the kit itself. */
export function exportKit(kit: Kit, ctx: Ctx, format: Format, machine: Machine, kitJSON: string): { files: OutFile[]; sheets: number } {
  const lay = layoutKit(kit, ctx, machine.refSquare)
  const base = kit.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kit'
  const pages = lay.sheets.map((paths) => ({ paths, sheet: { w: kit.sheet.w, h: kit.sheet.h } }))
  return {
    files: [...render(base, pages, format, machine), { name: `${base}-parts.csv`, data: partsCSV(kit) }, { name: `${base}.json`, data: kitJSON }],
    sheets: lay.sheets.length,
  }
}

