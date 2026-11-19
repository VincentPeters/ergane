import { describe, expect, it } from 'vitest'
import { toDXF } from './dxf'
import { DEFAULT_MACHINE, exportKit, exportPart, kitCtx, layoutKit, partsCSV, sanitizeMachine } from './export'
import { MATERIALS, PROFILES, bbox, generate, validate, type Ctx } from './geometry'
import { decodeKit, emptyKit, encodeKit, kitToJSON, parseKit, starterKit } from './kit'
import { pack } from './layout'
import { toPDF } from './pdf'
import { toSVG } from './svg'
import { zip } from './zip'

const ctx: Ctx = { profile: PROFILES[0], material: MATERIALS[0], fit: 'normal' }
const strip = generate({ type: 'strip', holes: 11, rows: 1, label: true }, ctx)

describe('kits', () => {
  it('round-trips through spec-12 JSON', () => {
    const kit = starterKit()
    const back = parseKit(kitToJSON(kit))
    expect(back).toEqual(kit)
  })

  it('drops unknown parts and clamps everything else', () => {
    const k = parseKit(JSON.stringify({
      parts: [{ type: 'strip', holes: 999, rows: 1, qty: 9999 }, { type: 'rocket', qty: 1 }, null],
      material: { id: 'nope' }, fit: 'sideways', sheet: { width: -5 },
    }))
    if (typeof k === 'string') throw new Error(k)
    expect(k.items).toHaveLength(1)
    expect(k.items[0]).toMatchObject({ part: { holes: 50 }, qty: 500 })
    expect(k.material).toBe(MATERIALS[0].id)
    expect(k.fit).toBe('normal')
    expect(k.sheet.w).toBe(50)
    expect(parseKit('{')).toMatch(/not valid JSON/)
  })

  it('travels in a share link', async () => {
    const kit = starterKit()
    const payload = await encodeKit(kit)
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await decodeKit(payload)).toEqual(kit)
    expect(await decodeKit('not-a-kit')).toMatch(/does not contain/)
  })

  it('keeps only known part fields, so no stray text reaches the parts list', () => {
    const k = parseKit(JSON.stringify({ parts: [{ type: 'strip', holes: 5, rows: 1, qty: 1, note: '=HYPERLINK("http://x")' }] }))
    if (typeof k === 'string') throw new Error(k)
    expect(Object.keys(k.items[0].part).sort()).toEqual(['holes', 'label', 'rows', 'type'])
    expect(partsCSV(k)).not.toContain('HYPERLINK')
  })

  it('refuses kits too large to lay out in the browser', async () => {
    const many = { parts: Array.from({ length: 3 }, () => ({ type: 'strip', holes: 3, rows: 1, qty: 500 })) }
    expect(parseKit(JSON.stringify(many))).toMatch(/at most 1000 pieces/)
    const dense = { parts: Array.from({ length: 50 }, () => ({ type: 'plate', cols: 50, rows: 50, pattern: 'full', radius: 2, qty: 1 })) }
    expect(parseKit(JSON.stringify(dense))).toMatch(/too many cuts/)
    // A tiny link that inflates past 1 MB is stopped while decompressing.
    const bomb = new TextEncoder().encode(`{"parts":[],"name":"${'a'.repeat(2_000_000)}"}`)
    const z = new Uint8Array(await new Response(new Blob([bomb]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
    let s = ''
    for (const b of z) s += String.fromCharCode(b)
    const payload = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(payload.length).toBeLessThan(50_000)
    expect(await decodeKit(payload)).toMatch(/does not contain/)
  })

  it('lists parts as CSV with IDs, types, parameters and quantities', () => {
    const csv = partsCSV(starterKit()).trim().split('\n')
    expect(csv[0]).toBe('part_id,type,parameters,quantity')
    expect(csv).toHaveLength(starterKit().items.length + 1)
    expect(csv[1]).toMatch(/^P01,strip,"?holes=3; rows=1; label=true"?,4$/)
  })
})

describe('sheet layout', () => {
  it('packs the starter kit without overlaps, inside its sheets', () => {
    const kit = starterKit()
    const lay = layoutKit(kit, kitCtx(kit, 0.2), false)
    expect(lay.tooBig).toEqual([])
    expect(lay.placed).toHaveLength(kit.items.reduce((s, it) => s + it.qty, 0))
    for (const sheet of lay.sheets) {
      const b = bbox(sheet)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.w).toBeLessThanOrEqual(kit.sheet.w)
      expect(b.y + b.h).toBeLessThanOrEqual(kit.sheet.h)
    }
  })

  it('never overlaps two pieces', () => {
    const pieces = Array.from({ length: 30 }, (_, i) => generate({ type: 'strip', holes: 3 + (i % 9), rows: 1 }, ctx))
    const { sheets } = pack(pieces, { w: 300, h: 200, spacing: 2 })
    for (const sheet of sheets) {
      const boxes = sheet.filter((p) => p.op === 'outer').map((p) => bbox([p]))
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j]
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
          expect(apart).toBe(true)
        }
    }
  })

  it('reports parts larger than the sheet (rule 3)', () => {
    const big = { type: 'plate', cols: 40, rows: 30, pattern: 'full', radius: 2 } as const
    expect(pack([generate(big, ctx)], { w: 300, h: 200, spacing: 2 }).tooBig).toEqual([0])
    expect(validate(big, { ...ctx, sheet: { w: 300, h: 200, spacing: 2 } }).map((i) => i.rule)).toContain('sheet-fit')
    expect(validate({ type: 'strip', holes: 11, rows: 1 }, { ...ctx, sheet: { w: 300, h: 200, spacing: 2 } })).toEqual([])
  })

  it('exports the starter kit in under 2 seconds (spec 13)', () => {
    const kit = starterKit()
    const t0 = performance.now()
    const { files, sheets } = exportKit(kit, kitCtx(kit, 0.2), 'svg', DEFAULT_MACHINE, kitToJSON(kit))
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(sheets).toBeGreaterThan(0)
    expect(files.map((f) => f.name)).toContain('starter-kit-parts.csv')
  })
})

describe('formats', () => {
  it('writes DXF R12 with one layer per operation and every hole as a circle', () => {
    const dxf = toDXF(strip)
    expect(dxf).toContain('AC1009')
    for (const layer of ['engrave', 'cut-inner', 'cut-outer']) expect(dxf).toContain(`\n2\n${layer}\n`)
    expect(dxf.match(/\nCIRCLE\n/g)).toHaveLength(11)
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
  })

  it('writes a PDF with one page per sheet and a valid cross-reference table', () => {
    const pdf = toPDF([{ paths: strip }, { paths: strip }])
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('/Count 2')
    const xref = Number(pdf.match(/startxref\n(\d+)/)![1])
    expect(pdf.slice(xref, xref + 4)).toBe('xref')
    const offsets = [...pdf.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]))
    offsets.forEach((o, i) => expect(pdf.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true))
  })

  it('zips files with correct CRCs and a central directory', () => {
    const z = zip([{ name: 'a.txt', data: 'abc' }, { name: 'b.txt', data: 'hello' }])
    const v = new DataView(z.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    expect(v.getUint32(14, true)).toBe(0x352441c2) // crc32("abc")
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(2)
  })
})

describe('machine profiles', () => {
  it('splits one file per operation, skipping empty ones', () => {
    const files = exportPart('strip', strip, 'svg', { ...DEFAULT_MACHINE, split: 'per-op' })
    expect(files.map((f) => f.name)).toEqual(['strip-engrave.svg', 'strip-cut-inner.svg', 'strip-cut-outer.svg'])
    const unlabeled = generate({ type: 'strip', holes: 11, rows: 1 }, ctx)
    expect(exportPart('strip', unlabeled, 'svg', { ...DEFAULT_MACHINE, split: 'per-op' })).toHaveLength(2)
  })

  it('draws everything in one colour for hand-ordered machines', () => {
    const [f] = exportPart('strip', strip, 'svg', { ...DEFAULT_MACHINE, split: 'single' })
    expect(f.data.match(/stroke="#[0-9A-F]{6}"/g)!.every((s) => s === 'stroke="#000000"')).toBe(true)
  })

  it('remaps colours and adds a 10 mm reference square on request', () => {
    const m = { ...DEFAULT_MACHINE, colors: { engrave: '#FF00FF', inner: '#00FFFF', outer: '#000000' }, refSquare: true }
    const [f] = exportPart('strip', strip, 'svg', m)
    expect(f.data).toContain('stroke="#FF00FF"')
    expect(f.data).toContain('stroke="#00FFFF"')
    expect(f.data).toMatch(/M-?[\d.]+ -?[\d.]+L-?[\d.]+ -?[\d.]+L/) // the square is there
    const sq = toSVG(strip, { colors: m.colors })
    expect(sq).not.toBe(f.data)
  })

  it('rejects a broken stored profile and fixes bad colours', () => {
    expect(sanitizeMachine({ id: 'Bad id', name: 'x' })).toBeNull()
    expect(sanitizeMachine({ id: 'mine', name: 'Mine', colors: { outer: 'red' }, split: 'nope' }))
      .toEqual({ id: 'mine', name: 'Mine', colors: DEFAULT_MACHINE.colors, split: 'layers', refSquare: false })
  })

  it('keeps an empty kit exportable', () => {
    const kit = emptyKit()
    expect(exportKit(kit, kitCtx(kit, 0.2), 'pdf', DEFAULT_MACHINE, kitToJSON(kit)).sheets).toBe(0)
  })
})
